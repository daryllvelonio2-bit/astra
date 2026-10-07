/**
 * Hosting: run a project's own server inside the Debian guest and publish it to
 * the internet through a tunnel that needs NO account, NO token and NO signup.
 *
 * Why this shape, and not the obvious tools:
 *  - dockerd cannot run here. PRoot is ptrace-based user-space emulation with no
 *    namespaces and no cgroups, and the Android sandbox blocks the rest, so a
 *    container engine is off the table (tried; udocker works but that is a
 *    different feature).
 *  - ngrok is off the table because it wants an account and an authtoken, and an
 *    authtoken shipped inside an APK is a secret anyone can extract.
 *  - What remains is a plain TCP tunnel run from the guest:
 *      cloudflared's quick tunnel  -> https://<random>.trycloudflare.com (no login)
 *      ssh -R 80:localhost:<port> nokey@localhost.run -> public https URL
 *    openssh-client is already part of the toolchain, so the ssh route needs no
 *    extra download and is preferred when cloudflared is absent.
 *
 * How processes are kept alive: there is no channel back from a backgrounded
 * guest process, so long-lived things are started with nohup, detached, and
 * their output drained from a log file in /tmp with one-shot `executeCommand`
 * calls. That is also how the public URL is discovered — it is printed by the
 * tunnel binary and parsed out of its log.
 *
 * Caveat that belongs in the UI, not hidden here: the app has no foreground
 * service, so Android may suspend it once it leaves the foreground. Hosting
 * lives while the app is open.
 */
import {
  executeCommand,
  isEnvironmentReady,
} from "../../../modules/linux-runner/src";

export type HostProjectKind = "laravel" | "node" | "static";

export type HostStatus =
  | "idle"
  | "checking"
  | "installing"
  | "starting"
  | "tunneling"
  | "running"
  | "error";

export interface HostState {
  status: HostStatus;
  kind: HostProjectKind | null;
  workspaceId: string | null;
  projectName: string;
  port: number | null;
  publicUrl: string | null;
  tunnel: string | null;
  /** Human-readable, shown under the spinner. Never a raw command. */
  step: string;
  log: string[];
  error: string | null;
}

export interface RuntimeInfo {
  installed: boolean;
  /** What the user needs to install, in plain words. */
  label: string;
  binary: string;
  /** apt packages, in the order the guest wants them. */
  apt: string[];
  /** Rough download size, so the user can decide on mobile data. */
  approxSize: string;
}

const HOST_LOG = "/tmp/astra-host.log";
const HOST_PID = "/tmp/astra-host.pid";
const TUNNEL_LOG = "/tmp/astra-tunnel.log";
const TUNNEL_PID = "/tmp/astra-tunnel.pid";

/**
 * Everything the guest needs before a project can be served, and the command
 * that actually serves it. Kept in one table so the panel and the service can
 * never disagree about what "Laravel" means.
 */
export const HOST_PLANS: Record<
  HostProjectKind,
  {
    label: string;
    binary: string;
    apt: string[];
    approxSize: string;
    defaultPort: number;
    serve: (guestDir: string, port: number, flavor?: NodeFlavor) => string;
    /** A file whose presence in the project root identifies this kind. */
    detect: (rootNames: string[], pkg: any) => boolean;
  }
> = {
  laravel: {
    label: "Laravel (PHP)",
    binary: "php",
    // Deliberately the -cli packages only: no web server, no composer. The
    // guest serves with PHP's built-in server, and vendor/ is expected in the
    // repository (or installed by the user), which keeps this a ~60 MB download
    // instead of several hundred.
    apt: [
      "php-cli",
      "php-sqlite3",
      "php-mbstring",
      "php-xml",
      "php-curl",
      "php-zip",
      "php-gd",
      "php-bcmath",
    ],
    approxSize: "≈60 MB",
    defaultPort: 8000,
    serve: (dir, port) =>
      `cd ${dir} && php artisan serve --host=0.0.0.0 --port=${port}`,
    detect: (rootNames) => has(rootNames, "artisan"),
  },
  node: {
    label: "React / Node dev server",
    binary: "npm",
    apt: ["nodejs", "npm"],
    approxSize: "≈40 MB",
    defaultPort: 5173,
    serve: (dir, port, flavor) => {
      // Each framework wants its host/port flags spelled its own way; a bare
      // `npm run dev` would bind to 127.0.0.1 inside the guest and be reachable
      // only from the guest itself, which is the classic "the tunnel is up but
      // the site is blank" failure.
      switch (flavor) {
        case "vite":
          return `cd ${dir} && npm run dev -- --host 0.0.0.0 --port ${port}`;
        case "next":
          return `cd ${dir} && npm run dev -- -H 0.0.0.0 -p ${port}`;
        case "cra":
          return `cd ${dir} && HOST=0.0.0.0 PORT=${port} BROWSER=none npm start`;
        default:
          return `cd ${dir} && HOST=0.0.0.0 PORT=${port} npm run dev`;
      }
    },
    detect: (rootNames, pkg) => has(rootNames, "package.json") && !!pkg,
  },
  static: {
    label: "Static site",
    binary: "python3",
    apt: ["python3"],
    approxSize: "≈30 MB",
    defaultPort: 8080,
    serve: (dir, port) => `cd ${dir} && python3 -m http.server ${port} --bind 0.0.0.0`,
    detect: (rootNames, pkg) => !pkg && has(rootNames, "index.html"),
  },
};

function has(rootNames: string[], name: string): boolean {
  const lower = rootNames.map((n) => n.toLowerCase());
  return lower.includes(name.toLowerCase());
}

export type NodeFlavor = "vite" | "next" | "cra" | "other";

/** Which dev-server dialect this package.json speaks. */
export function nodeFlavor(pkg: any): NodeFlavor {
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  if (deps.vite) return "vite";
  if (deps.next) return "next";
  if (deps["react-scripts"]) return "cra";
  return "other";
}

/**
 * Pick the project kind from the files at the workspace root. Order matters:
 * a Laravel app can also contain an index.html in public/, but artisan wins.
 */
export function detectHostKind(rootNames: string[], pkg: any): HostProjectKind | null {
  const order: HostProjectKind[] = ["laravel", "node", "static"];
  return order.find((k) => HOST_PLANS[k].detect(rootNames, pkg)) ?? null;
}

// ---------------------------------------------------------------------------
// state + subscription (same shape as the toolchain gate, so the UI is boring)
// ---------------------------------------------------------------------------

let state: HostState = {
  status: "idle",
  kind: null,
  workspaceId: null,
  projectName: "",
  port: null,
  publicUrl: null,
  tunnel: null,
  step: "",
  log: [],
  error: null,
};

const listeners = new Set<() => void>();

export function subscribeHosting(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getHostingState(): HostState {
  return state;
}

function set(patch: Partial<HostState>): void {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}

function pushLog(line: string): void {
  const clean = line.replace(/\u001b\[[0-9;]*m/g, "").trimEnd();
  if (!clean) return;
  state = { ...state, log: [...state.log, clean].slice(-60) };
  listeners.forEach((fn) => fn());
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run(command: string): Promise<{ code: number; out: string }> {
  try {
    const res: any = await executeCommand(command);
    return { code: res?.exitCode ?? 0, out: String(res?.stdout ?? "") };
  } catch (e: any) {
    return { code: 1, out: String(e?.message || e || "") };
  }
}

// ---------------------------------------------------------------------------
// runtime: check + user-initiated install
// ---------------------------------------------------------------------------

export async function checkRuntime(kind: HostProjectKind): Promise<RuntimeInfo> {
  const plan = HOST_PLANS[kind];
  const res = await run(`command -v ${plan.binary}`);
  const installed = res.code === 0 && !!res.out.trim();
  return {
    installed,
    label: plan.label,
    binary: plan.binary,
    apt: plan.apt,
    approxSize: plan.approxSize,
  };
}

/**
 * Install the runtime for `kind`. Only ever called from an explicit tap — the
 * project's policy is that nothing auto-installs behind the user's back, and on
 * mobile data a 60 MB apt run is a decision, not a detail.
 */
export async function installRuntime(kind: HostProjectKind): Promise<boolean> {
  const plan = HOST_PLANS[kind];
  set({ status: "installing", step: `Installing ${plan.label} (${plan.approxSize})…` });
  // Same resilient apt preamble the toolchain provisioner uses: stale locks and
  // half-configured packages are the normal state of a phone that was killed
  // mid-install, and one bad package must not abort the rest.
  const base =
    "export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin; " +
    "export HOME=/root; export LC_ALL=C.UTF-8; export LANG=C.UTF-8; " +
    "export DEBIAN_FRONTEND=noninteractive; " +
    "rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/cache/apt/archives/lock /var/lib/apt/lists/lock 2>/dev/null; " +
    "dpkg --configure -a 2>/dev/null || true; apt-get install -f -y 2>/dev/null || true; " +
    "apt-get update -y >/dev/null 2>&1 || true";
  const install = `for p in ${plan.apt.join(" ")}; do echo "installing $p"; apt-get install -y --no-install-recommends "$p" || echo "PKG_FAIL:$p"; done; true`;
  pushLog(`Installing ${plan.apt.join(", ")}`);
  const res = await run(`${base}; ${install} > ${HOST_LOG} 2>&1; echo DONE`);

  // Report the tail so the user sees dpkg working instead of a frozen spinner.
  const tail = await run(`tail -n 3 ${HOST_LOG}`);
  tail.out.split("\n").forEach(pushLog);

  const after = await checkRuntime(kind);
  if (!after.installed) {
    set({
      status: "error",
      step: "",
      error: `${plan.label} did not install correctly. Check Settings → Linux → Optional Extras, or the Terminal tab for the apt output.`,
    });
    return false;
  }
  pushLog(`${plan.binary} is ready`);
  set({ status: "idle", step: "", error: null });
  return true;
}

// ---------------------------------------------------------------------------
// start / stop
// ---------------------------------------------------------------------------

/**
 * Start the project's server in the guest and publish it.
 *
 * Returns the public URL on success. Every failure sets state.error to something
 * a person can act on — the raw shell text goes to the log instead.
 */
export async function startHosting(opts: {
  workspaceId: string;
  projectName: string;
  kind: HostProjectKind;
  nodeFlavor?: NodeFlavor;
}): Promise<string | null> {
  const { workspaceId, projectName, kind } = opts;
  const plan = HOST_PLANS[kind];
  const port = plan.defaultPort;
  const guestDir = `/workspaces/${workspaceId}`;

  await stopHosting();
  set({
    status: "checking",
    kind,
    workspaceId,
    projectName,
    port,
    publicUrl: null,
    tunnel: null,
    step: "Checking the Linux environment…",
    log: [],
    error: null,
  });

  if (!isEnvironmentReady()) {
    set({
      status: "error",
      step: "",
      error: "The Linux environment is not set up yet. Open Settings → Linux and finish the setup, then come back.",
    });
    return null;
  }

  const runtime = await checkRuntime(kind);
  if (!runtime.installed) {
    set({
      status: "error",
      step: "",
      error: `${plan.label} is not installed yet. Tap Install below — it needs ${plan.approxSize}.`,
    });
    return null;
  }

  // --- 1. the server -------------------------------------------------------
  set({ status: "starting", step: `Starting ${plan.label} on port ${port}…` });
  const serve = plan.serve(guestDir, port, opts.nodeFlavor);
  pushLog(`$ ${serve}`);
  await run(`rm -f ${HOST_LOG} ${HOST_PID}`);
  await run(
    `cd ${guestDir} && nohup bash -lc ${JSON.stringify(serve)} > ${HOST_LOG} 2>&1 & echo $! > ${HOST_PID}; sleep 1; cat ${HOST_PID}`
  );

  // Wait for something to answer on the port. A dev server can take a while
  // (first vite/webpack build), so this is generous but bounded.
  const ready = await waitForPort(port, 60, () => {
    set({ step: `Waiting for the server to answer on port ${port}…` });
  });
  if (!ready) {
    const log = await run(`tail -n 8 ${HOST_LOG}`);
    log.out.split("\n").forEach(pushLog);
    set({
      status: "error",
      step: "",
      error:
        "The server started but never answered. The last lines of its output are below — usually a missing dependency (run the install it asks for in the Terminal) or a port already in use.",
    });
    return null;
  }
  pushLog(`server is answering on 127.0.0.1:${port}`);

  // --- 2. the tunnel -------------------------------------------------------
  set({ status: "tunneling", step: "Opening a public tunnel…" });
  const url = await openTunnel(port);
  if (!url) {
    set({
      status: "error",
      step: "",
      error:
        "The server is running in the guest, but no public tunnel could be opened. Check the log below; the usual cause is no network, or openssh-client missing from the toolchain.",
    });
    return null;
  }

  pushLog(`public URL: ${url}`);
  set({
    status: "running",
    step: "",
    publicUrl: url,
    error: null,
  });
  return url;
}

/** Poll the guest's own loopback until the server answers. */
async function waitForPort(port: number, seconds: number, onTick: () => void): Promise<boolean> {
  for (let i = 0; i < seconds; i++) {
    const res = await run(
      `curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:${port}/ || echo 000`
    );
    const code = res.out.trim().slice(-3);
    if (code && code !== "000") return true;
    if (i % 3 === 0) onTick();
    await sleep(1000);
  }
  return false;
}

/**
 * Bring up a tunnel and return its public URL, or null.
 *
 * cloudflared first when it exists (it is the more reliable of the two), then
 * the ssh reverse tunnel, which needs nothing beyond the openssh-client the
 * toolchain already installs.
 */
async function openTunnel(port: number): Promise<string | null> {
  const hasCloudflared = (await run("command -v cloudflared")).code === 0;

  if (hasCloudflared) {
    set({ step: "Opening a Cloudflare quick tunnel…", tunnel: "cloudflared" });
    await run(`rm -f ${TUNNEL_LOG} ${TUNNEL_PID}`);
    await run(
      `nohup cloudflared tunnel --url http://localhost:${port} --no-autoupdate > ${TUNNEL_LOG} 2>&1 & echo $! > ${TUNNEL_PID}; sleep 1; true`
    );
    const url = await waitForUrl(TUNNEL_LOG, /https:\/\/[a-z0-9-]+\.trycloudflare\.com/, 45);
    if (url) return url;
    pushLog("cloudflared did not produce a URL; falling back to ssh reverse tunnel");
  }

  const hasSsh = (await run("command -v ssh")).code === 0;
  if (!hasSsh) {
    pushLog("ssh is missing (Settings → Linux → Optional Extras → openssh-client)");
    return null;
  }

  set({ step: "Opening a public tunnel over ssh…", tunnel: "localhost.run" });
  await run(`rm -f ${TUNNEL_LOG} ${TUNNEL_PID}`);
  // -n: never read stdin (a backgrounded ssh that reads stdin hangs).
  // StrictHostKeyChecking=no + /dev/null known-hosts: no interactive prompt can
  // be answered from a detached process.
  await run(
    `nohup ssh -n -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null ` +
      `-o ServerAliveInterval=30 -o ExitOnForwardFailure=yes ` +
      `-R 80:localhost:${port} nokey@localhost.run > ${TUNNEL_LOG} 2>&1 & ` +
      `echo $! > ${TUNNEL_PID}; sleep 1; true`
  );
  return await waitForUrl(
    TUNNEL_LOG,
    /https:\/\/[a-z0-9-]+\.(?:lhr\.life|localhost\.run)/,
    45
  );
}

/** Drain a log file looking for the tunnel's public URL. */
async function waitForUrl(logFile: string, pattern: RegExp, seconds: number): Promise<string | null> {
  for (let i = 0; i < seconds; i++) {
    const res = await run(`cat ${logFile} 2>/dev/null | tail -n 25`);
    const match = res.out.match(pattern);
    if (match) return match[0];
    if (res.out.trim()) {
      // Surface progress; the tunnel prints a few configuration lines first.
      const last = res.out.trim().split("\n").pop() || "";
      if (last && !/^#/.test(last)) set({ step: last.slice(0, 90) });
    }
    await sleep(1000);
  }
  const tail = await run(`tail -n 6 ${logFile} 2>/dev/null`);
  tail.out.split("\n").forEach(pushLog);
  return null;
}

/** Stop the server and the tunnel. Safe to call when nothing is running. */
export async function stopHosting(): Promise<void> {
  await run(
    `for f in ${HOST_PID} ${TUNNEL_PID}; do ` +
      `if [ -f $f ]; then kill $(cat $f) 2>/dev/null; rm -f $f; fi; done; ` +
      `pkill -f "cloudflared tunnel" 2>/dev/null; ` +
      `pkill -f "ssh -n -o StrictHostKeyChecking=no" 2>/dev/null; ` +
      `pkill -f "artisan serve" 2>/dev/null; ` +
      `pkill -f "http.server" 2>/dev/null; ` +
      `true`
  );
  const wasRunning = state.status !== "idle" && state.status !== "error";
  if (wasRunning) pushLog("stopped");
  set({
    status: "idle",
    step: "",
    publicUrl: null,
    tunnel: null,
    port: null,
  });
}
