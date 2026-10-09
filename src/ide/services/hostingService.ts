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
import { getWorkspaceDirPath } from "./workspaceService";
import {
  HostProjectKind,
  HOST_PLANS,
  NodeFlavor,
  RuntimeInfo,
} from "./hostingPlans";



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


const HOST_LOG = "/tmp/astra-host.log";
const HOST_PID = "/tmp/astra-host.pid";
const TUNNEL_LOG = "/tmp/astra-tunnel.log";
const TUNNEL_PID = "/tmp/astra-tunnel.pid";
const PREP_LOG = "/tmp/astra-prep.log";
const PREP_PID = "/tmp/astra-prep.pid";

/**
 * Everything the guest needs before a project can be served, and the command
 * that actually serves it. Kept in one table so the panel and the service can
 * never disagree about what "Laravel" means.
 */

/**
 * Pick the project kind from the files at the workspace root. Order matters:
 * a Laravel app can also contain an index.html in public/, but artisan wins.
 */
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
  // NOT /workspaces/<id>: the registry id is a slug while the folder on disk
  // keeps its own name (the same id-vs-folder trap that produced duplicate
  // workspace cards). getWorkspaceDirPath returns the real folder, and the
  // guest sees it under /workspaces, so take the last path segment.
  let guestDir = `/workspaces/${workspaceId}`;
  try {
    const hostDir = String(await getWorkspaceDirPath(workspaceId)).replace(/\/+$/, "");
    const folder = hostDir.split("/").pop();
    if (folder) guestDir = `/workspaces/${folder}`;

    // Do NOT trust the resolved path. The registry id is a slug while the folder on disk
    // keeps its own name, and a project can sit in a custom parent outside the app's
    // private workspaces dir, in which case the guest never sees it under /workspaces and
    // composer runs in an empty directory ("please create a composer.json file"). Discover
    // the project in the guest instead: the resolved folder first, then by folder name
    // anywhere, then any project marker under /workspaces as a last resort.
    const has = await run(`[ -f ${guestDir}/composer.json ] && echo YES || echo NO`);
    if (!has.out.includes("YES")) {
      if (folder) {
        const byName = await run(
          `find / -maxdepth 5 -type d -name ${folder} 2>/dev/null | head -1`
        );
        const hit = byName.out.trim().split("\n").pop()?.trim() || "";
        if (hit && !hit.startsWith("/proc")) guestDir = hit;
      }
      const marker = await run(
        `find /workspaces -maxdepth 3 -name composer.json -print -quit 2>/dev/null`
      );
      const m = marker.out.trim().split("\n")[0]?.trim() || "";
      if (m.endsWith("/composer.json")) guestDir = m.replace(/\/composer\.json$/, "");
    }
  } catch (_) {}

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

  await prepareGuest();

  const runtime = await checkRuntime(kind);
  if (!runtime.installed) {
    set({
      status: "error",
      step: "",
      error: `${plan.label} is not installed yet. Tap Install below — it needs ${plan.approxSize}.`,
    });
    return null;
  }

  // --- 0. the project itself (Laravel only) --------------------------------
  // composer install can run for minutes, far past a one-shot command's limit,
  // so it is detached and polled like the server is.
  if (plan.prepare) {
    set({ status: "installing", step: "Preparing the project (first run only)…" });
    const steps = plan.prepare(guestDir);
    for (let i = 0; i < steps.length; i++) {
      const st = steps[i];
      pushLog(`prep ${i + 1}/${steps.length}: ${st.cmd.slice(0, 70)}`);
      const res = await run(st.cmd);
      if (st.detached) {
        if (st.waitFor) {
          // vendor/ is already on disk from a previous run: redoing the install
          // costs minutes for no change. The artifact IS the readiness signal.
          const already = await run(`[ -f ${st.waitFor} ] && echo YES || echo NO`);
          if (already.out.includes("YES")) {
            pushLog("already installed — skipping the dependency step");
            continue;
          }
          const done = await waitForFile(st.waitFor, 1800);
          if (!done) {
            const tail = await run(`tail -n 8 ${PREP_LOG}`);
            tail.out.split("\n").forEach(pushLog);
            set({
              status: "error",
              step: "",
              error:
                "composer did not finish installing the project's dependencies. Its last lines are below.",
            });
            return null;
          }
        }
        continue;
      }
      if (res.code !== 0) {
        // A step that FAILED must never look like a step that worked. This is the
        // bug that cost the earlier attempts: the launch failed silently.
        pushLog(`step failed (exit ${res.code}): ${res.out.trim().slice(-160) || "(no output)"}`);
        set({
          status: "error",
          step: "",
          error: `Preparing the project failed at step ${i + 1}: ${st.cmd.slice(0, 60)}…`,
        });
        return null;
      }
    }
    pushLog("project prepared");
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
  let ready = await waitForPort(port, 60, () => {
    set({ step: `Waiting for the server to answer on port ${port}…` });
  });
  // artisan serve shells out to PHP's built-in server itself; the spike measured
  // `php -S 0.0.0.0:<port> -t public` working directly, so fall back to that
  // instead of reporting failure when artisan is unhappy about vendor/.
  if (!ready && kind === "laravel") {
    pushLog("php artisan serve did not answer; retrying with PHP's built-in server on public/");
    set({ step: "Retrying with PHP's built-in server…" });
    await run(`rm -f ${HOST_LOG}`);
    await run(
      `cd ${guestDir} && nohup bash -lc 'php -S 0.0.0.0:${port} -t public' > ${HOST_LOG} 2>&1 & echo $! > ${HOST_PID}; sleep 1; true`
    );
    ready = await waitForPort(port, 45, () => {
      set({ step: "Waiting for PHP to answer…" });
    });
  }
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

/**
 * Two files the guest lacks that broke every measured attempt until they were
 * added, so they are asserted before anything else runs:
 *
 *  - /etc/hosts has no `localhost`. cloudflared looks it up, fails
 *    ("lookup localhost on 1.1.1.1:53: no such host") and EXITS after printing
 *    its URL -- a tunnel that looks fine and is already dead.
 *  - curl exits (77) on a missing CA-bundle path, which killed the readiness
 *    probe even though the probe itself is plain HTTP.
 *
 * Both are idempotent and cheap enough to assert on every start.
 */
async function prepareGuest(): Promise<void> {
  await run(
    "grep -q '127.0.0.1 localhost' /etc/hosts 2>/dev/null || echo '127.0.0.1 localhost' >> /etc/hosts; " +
      "[ -e /etc/ssl/cert.pem ] || ln -sf /etc/ssl/certs/ca-certificates.crt /etc/ssl/cert.pem; " +
      "true"
  );
}

/**
 * Poll for the file a detached step produces, surfacing the tail of its log as
 * the current step. A silent wait was how a 15-minute stall looked like work.
 */
async function waitForFile(path: string, seconds: number): Promise<boolean> {
  for (let i = 0; i < Math.ceil(seconds / 5); i++) {
    // ONE command per batch, not two per iteration: spawning a guest process is
    // the expensive part under PRoot, and doing it every five seconds is what
    // made a wait look like a loop.
    const res = await run(
      `for i in 1 2 3 4 5 6 7 8 9 10; do [ -f ${path} ] && { echo YES; break; }; sleep 5; done`
    );
    if (res.out.includes("YES")) return true;
    const last = await run(`tail -n 1 ${PREP_LOG} 2>/dev/null`);
    const line = last.out.trim();
    if (line && line !== "YES" && line !== "NO") set({ step: line.slice(0, 80) });
  }
  return false;
}

/** Poll the guest's own loopback until the server answers. */
async function waitForPort(port: number, seconds: number, onTick: () => void): Promise<boolean> {
  // ONE command polls inside the guest. The previous version launched a separate
  // guest process every second -- under PRoot each start costs seconds, so a
  // "60 second" wait ran for minutes and saturated the guest. That is what made
  // the terminal look dead, `cd` unresponsive, and hosting appear to hang: one
  // bug, three symptoms. Any HTTP response counts, including a 500, because it
  // proves the server is listening; the tunnel is a separate step.
  const batches = Math.max(1, Math.ceil(seconds / 20));
  for (let b = 0; b < batches; b++) {
    if (hostCancelled) return false;
    if (b > 0) onTick();
    const res = await run(
      `for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do ` +
        `curl -s -o /dev/null --max-time 2 http://127.0.0.1:${port}/ && { echo READY; break; }; ` +
        `sleep 1; done; echo CHECKED`
    );
    if (res.out.includes("READY")) return true;
    // The server's own words, so a failure names itself instead of spinning.
    const tail = await run(`tail -n 2 ${HOST_LOG} 2>/dev/null`);
    const line = tail.out.trim().split("\n").pop() || "";
    if (line && !line.includes("READY")) pushLog(line.slice(0, 120));
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
      `nohup cloudflared tunnel --url http://127.0.0.1:${port} --no-autoupdate > ${TUNNEL_LOG} 2>&1 & echo $! > ${TUNNEL_PID}; sleep 1; true`
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
      `-R 80:127.0.0.1:${port} nokey@localhost.run > ${TUNNEL_LOG} 2>&1 & ` +
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
  const batches = Math.max(1, Math.ceil(seconds / 20));
  for (let b = 0; b < batches; b++) {
    // Same lesson as the port check: one in-guest command that loops, instead of
    // a fresh guest process every second.
    const res = await run(
      `for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do ` +
        `grep -oE 'https://[a-z0-9.-]+' ${logFile} 2>/dev/null | head -1 && break; sleep 1; done; ` +
        `tail -n 2 ${logFile} 2>/dev/null`
    );
    const match = res.out.match(pattern);
    if (match) return match[0];
    const last = res.out.trim().split("\n").pop() || "";
    if (last && !/^#/.test(last)) set({ step: last.slice(0, 90) });
  }
  const tail = await run(`tail -n 6 ${logFile} 2>/dev/null`);
  tail.out.split("\n").forEach(pushLog);
  return null;
}

/** Stop the server and the tunnel. Safe to call when nothing is running. */
/** Set when the user cancels, so the wait loops stop instead of running out. */
let hostCancelled = false;

export async function stopHosting(): Promise<void> {
  hostCancelled = true;
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
