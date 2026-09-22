import {
  readFileContent,
  getWorkspaceDirPath,
  resolveFullPath,
} from "./workspaceService";
import { runningTasksService } from "../../ai/services/runningTasksService";
import {
  executeCommand,
  isEnvironmentReady,
  startTerminalSession,
  writeTerminalInput,
} from "../../../modules/linux-runner/src";
import { ideActionService } from "./ideActionService";
import {
  resolveRuntimeForBinary,
  buildAutoInstallRunScript,
} from "./extensions/extensionRuntimeService";
import { prepareRunScript } from "./runFormatter";

/**
 * Universal Run service: executes the active file (or a detected project
 * entry point) inside the on-device Debian guest and shows output in the
 * Terminal tab's Run session. HTML / server projects open in the Browser tab.
 *
 * Policy: never auto-install anything. A missing runtime surfaces the real
 * shell error plus a pointer to Settings → Linux → Optional Extras, and the
 * user installs it themselves.
 */

export const RUN_SESSION_ID = "run-session";

const EXTRAS_HINT =
  "Tip: missing runtimes can be installed in Settings → Linux → Optional Extras.";

export type RunKind = "terminal" | "browser" | "unsupported";

export interface RunPlan {
  kind: RunKind;
  /** Shell command executed in the guest (cwd = workspace or file dir). */
  command: string;
  /** Short label echoed above the output, e.g. "node server.js". */
  displayName: string;
  /** Runtime binary probed with `command -v` before running (terminal plans). */
  runtime?: string;
  /** Browser preview URL (browser plans). */
  url?: string;
  port?: number;
  /** Message shown instead of running anything (unsupported plans). */
  message?: string;
}

export interface RunCallbacks {
  onOpenTerminal: () => void;
  onOpenBrowser: (url: string) => void;
  onLog?: (line: string) => void;
}

/** POSIX single-quote a path for the guest shell. */
function q(p: string): string {
  return `'${p.replace(/'/g, `'\\''`)}'`;
}

function basename(p: string): string {
  const clean = p.replace(/\\/g, "/");
  const i = clean.lastIndexOf("/");
  return i >= 0 ? clean.slice(i + 1) : clean;
}

function dirname(p: string): string {
  const clean = p.replace(/\\/g, "/");
  const i = clean.lastIndexOf("/");
  return i > 0 ? clean.slice(0, i) : "";
}

function extOf(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i >= 0 ? fileName.slice(i + 1).toLowerCase() : "";
}

/** Guest absolute dir for a workspace-relative path. */
function guestDir(workspaceId: string, relPath: string): string {
  const dir = dirname(relPath);
  return dir ? `/workspaces/${workspaceId}/${dir}` : `/workspaces/${workspaceId}`;
}

/** First free port in 8080..8099 given ports already tracked. */
function pickPort(): number {
  const used = new Set(
    runningTasksService
      .getRunningTasks()
      .map((t) => t.port)
      .filter((p): p is number => typeof p === "number")
  );
  for (let p = 8080; p < 8100; p++) {
    if (!used.has(p)) return p;
  }
  return 8080;
}

interface DirectRunner {
  runtime: string;
  build: (file: string) => string;
  browser?: false;
}

// Extension → guest command. `node_modules`, pip packages etc. resolve
// because commands run in the file's own directory inside the guest.
const DIRECT_RUNNERS: Record<string, DirectRunner> = {
  js: { runtime: "node", build: (f) => `node ${q(f)}` },
  mjs: { runtime: "node", build: (f) => `node ${q(f)}` },
  cjs: { runtime: "node", build: (f) => `node ${q(f)}` },
  py: { runtime: "python3", build: (f) => `python3 ${q(f)}` },
  php: { runtime: "php", build: (f) => `php ${q(f)}` },
  ts: {
    runtime: "node",
    build: (f) => {
      const base = basename(f).replace(/\.(mts|cts|ts)$/i, "");
      return `npx --yes -p typescript tsc ${q(f)} --outDir /tmp/astrun --module commonjs --target es2020 && node /tmp/astrun/${q(base)}.js`;
    },
  },
  mts: {
    runtime: "node",
    build: (f) => {
      const base = basename(f).replace(/\.(mts|cts|ts)$/i, "");
      return `npx --yes -p typescript tsc ${q(f)} --outDir /tmp/astrun --module commonjs --target es2020 && node /tmp/astrun/${q(base)}.js`;
    },
  },
  cts: {
    runtime: "node",
    build: (f) => {
      const base = basename(f).replace(/\.(mts|cts|ts)$/i, "");
      return `npx --yes -p typescript tsc ${q(f)} --outDir /tmp/astrun --module commonjs --target es2020 && node /tmp/astrun/${q(base)}.js`;
    },
  },
  c: { runtime: "gcc", build: (f) => `gcc ${q(f)} -o /tmp/astrun && /tmp/astrun` },
  cpp: { runtime: "g++", build: (f) => `g++ ${q(f)} -o /tmp/astrun && /tmp/astrun` },
  cc: { runtime: "g++", build: (f) => `g++ ${q(f)} -o /tmp/astrun && /tmp/astrun` },
  cxx: { runtime: "g++", build: (f) => `g++ ${q(f)} -o /tmp/astrun && /tmp/astrun` },
  go: { runtime: "go", build: (f) => `go run ${q(f)}` },
  rs: { runtime: "rustc", build: (f) => `rustc ${q(f)} -o /tmp/astrun && /tmp/astrun` },
  java: {
    runtime: "java",
    build: (f) => {
      const cls = basename(f).replace(/\.java$/i, "");
      return `javac ${q(f)} && java ${q(cls)} || java ${q(f)}`;
    },
  },
  rb: { runtime: "ruby", build: (f) => `ruby ${q(f)}` },
  lua: { runtime: "lua5.4", build: (f) => `lua5.4 ${q(f)}` },
  sh: { runtime: "sh", build: (f) => `sh ${q(f)}` },
  bash: { runtime: "bash", build: (f) => `bash ${q(f)}` },
  sql: { runtime: "sqlite3", build: (f) => `sqlite3 /tmp/astrun.db < ${q(f)}` },
};

/**
 * Resolve what "Run" means for the given workspace-relative file path.
 * Direct mapping first; otherwise smart project-entry detection at the
 * workspace root (package.json / artisan / manage.py / index.html / ...).
 */
export async function resolveRunPlan(
  workspaceId: string,
  filePath: string,
  rootNames: string[]
): Promise<RunPlan> {
  const name = basename(filePath);
  const ext = extOf(name);
  const lower = rootNames.map((n) => n.toLowerCase());
  const has = (...cands: string[]) => cands.some((c) => lower.includes(c.toLowerCase()));

  // HTML previews directly in the Browser tab — instant preview, zero terminal, zero server overhead.
  if (ext === "html" || ext === "htm") {
    const baseDir = await getWorkspaceDirPath(workspaceId);
    const fullPath = resolveFullPath(baseDir, filePath);
    const fileUrl = fullPath.startsWith("file://") ? fullPath : `file://${fullPath}`;
    return {
      kind: "browser",
      command: "",
      displayName: name,
      url: fileUrl,
    };
  }

  const direct = DIRECT_RUNNERS[ext];
  if (direct) {
    return {
      kind: "terminal",
      command: `cd ${q(guestDir(workspaceId, filePath))} && ${direct.build(name)}`,
      displayName: `${direct.runtime} ${name}`,
      runtime: direct.runtime,
    };
  }

  // --- Smart project detection (open file isn't directly runnable) ---

  // Node project
  if (has("package.json")) {
    try {
      const raw = await readFileContent(workspaceId, "package.json");
      const pkg = raw ? JSON.parse(raw) : {};
      const start = pkg?.scripts?.start;
      const main = pkg?.main;
      const cmd =
        typeof start === "string" && start
          ? "npm start"
          : typeof main === "string" && main
          ? `node ${main}`
          : has("index.js")
          ? "node index.js"
          : has("server.js")
          ? "node server.js"
          : null;
      if (cmd) {
        return {
          kind: "terminal",
          command: `cd ${q(`/workspaces/${workspaceId}`)} && ${cmd}`,
          displayName: cmd,
          runtime: "node",
        };
      }
    } catch (_) {}
  }

  // Laravel / artisan
  if (has("artisan")) {
    const port = pickPort();
    return {
      kind: "browser",
      command: `cd ${q(`/workspaces/${workspaceId}`)} && php artisan serve --host=127.0.0.1 --port=${port} &`,
      displayName: `artisan serve :${port}`,
      runtime: "php",
      url: `http://127.0.0.1:${port}`,
      port,
    };
  }

  // Django
  if (has("manage.py")) {
    const port = pickPort();
    return {
      kind: "browser",
      command: `cd ${q(`/workspaces/${workspaceId}`)} && python3 manage.py runserver 127.0.0.1:${port} &`,
      displayName: `django runserver :${port}`,
      runtime: "python3",
      url: `http://127.0.0.1:${port}`,
      port,
    };
  }

  // Plain Python entry points
  for (const entry of ["app.py", "main.py", "server.py"]) {
    if (has(entry)) {
      return {
        kind: "terminal",
        command: `cd ${q(`/workspaces/${workspaceId}`)} && python3 ${entry}`,
        displayName: `python3 ${entry}`,
        runtime: "python3",
      };
    }
  }

  // Go module / Rust crate
  if (has("go.mod")) {
    return {
      kind: "terminal",
      command: `cd ${q(`/workspaces/${workspaceId}`)} && go run .`,
      displayName: "go run .",
      runtime: "go",
    };
  }
  if (has("Cargo.toml")) {
    return {
      kind: "terminal",
      command: `cd ${q(`/workspaces/${workspaceId}`)} && cargo run`,
      displayName: "cargo run",
      runtime: "cargo",
    };
  }

  // Static site fallback
  if (has("index.html")) {
    const baseDir = await getWorkspaceDirPath(workspaceId);
    const fullPath = resolveFullPath(baseDir, "index.html");
    const fileUrl = fullPath.startsWith("file://") ? fullPath : `file://${fullPath}`;
    return {
      kind: "browser",
      command: "",
      displayName: "index.html",
      url: fileUrl,
    };
  }

  return {
    kind: "unsupported",
    command: "",
    displayName: name,
    message: `No runnable entry found for "${name}". Run supports .html/.js/.py/.php/.ts, C/C++/Go/Rust/Java/Ruby/Lua/shell/SQL directly, plus Node, Laravel, Django, Go and Cargo projects.`,
  };
}

/** Probe a runtime binary inside the guest. */
async function hasRuntime(bin: string): Promise<boolean> {
  try {
    const res = await executeCommand(`command -v ${bin}`);
    return res.exitCode === 0 && !!res.stdout.trim();
  } catch (_) {
    return false;
  }
}

/**
 * Execute a resolved plan: terminal plans (and the server half of browser
 * plans) run in the Run session; browser plans then open the preview URL.
 */
export async function executeRunPlan(
  workspaceId: string,
  plan: RunPlan,
  cb: RunCallbacks
): Promise<void> {
  if (plan.kind === "unsupported") {
    cb.onOpenTerminal();
    ideActionService.emit("RUN_IN_TERMINAL", {
      command: `printf "\\033[1;31m✖ %s\\033[0m\\n" ${q(plan.message || "Nothing to run.")}`,
      workspaceId,
      userInitiated: true,
    });
    return;
  }

  try {
    if (!(await isEnvironmentReady())) {
      cb.onOpenTerminal();
      ideActionService.emit("RUN_IN_TERMINAL", {
        command: `printf "\\033[1;33m⚡ Linux environment is still provisioning (watch Settings → Linux).\\033[0m\\n"`,
        workspaceId,
        userInitiated: true,
      });
      return;
    }
  } catch (_) {}

  if (plan.runtime && !(await hasRuntime(plan.runtime))) {
    const known = resolveRuntimeForBinary(plan.runtime);
    if (known) {
      const autoCmd = buildAutoInstallRunScript(plan.command, known, plan.displayName);
      cb.onOpenTerminal();
      ideActionService.emit("RUN_IN_TERMINAL", {
        command: autoCmd,
        workspaceId,
        userInitiated: true,
      });
      return;
    }

    cb.onOpenTerminal();
    ideActionService.emit("RUN_IN_TERMINAL", {
      command: `printf "\\033[1;31m✖ Error: '${plan.runtime}' not found in Linux environment.\\033[0m\\n\\033[2m${EXTRAS_HINT}\\033[0m\\n"`,
      workspaceId,
      userInitiated: true,
    });
    return;
  }

  if (plan.kind === "browser" && plan.url) {
    if (!plan.command) {
      // Direct browser preview (e.g. HTML files) — no server or terminal required
      cb.onOpenBrowser(plan.url);
      return;
    }

    if (plan.runtime && !(await hasRuntime(plan.runtime))) {
      const known = resolveRuntimeForBinary(plan.runtime);
      if (known) {
        const autoCmd = buildAutoInstallRunScript(plan.command, known, plan.displayName);
        cb.onOpenTerminal();
        ideActionService.emit("RUN_IN_TERMINAL", {
          command: autoCmd,
          workspaceId,
          userInitiated: true,
        });
        return;
      }
      cb.onOpenTerminal();
      ideActionService.emit("RUN_IN_TERMINAL", {
        command: `printf "\\033[1;31m✖ Error: '${plan.runtime}' not found in Linux environment.\\033[0m\\n\\033[2m${EXTRAS_HINT}\\033[0m\\n"`,
        workspaceId,
        userInitiated: true,
      });
      return;
    }

    const runCmd = await prepareRunScript({
      fileName: plan.displayName,
      displayName: plan.displayName,
      runtime: plan.runtime,
      command: plan.command,
      isServer: true,
      url: plan.url,
      port: plan.port,
    });

    try {
      await startTerminalSession(RUN_SESSION_ID, workspaceId);
    } catch (err) {
      console.error("Failed to start run session:", err);
      cb.onLog?.(`Error: Failed to start terminal session: ${err}`);
      return;
    }
    try {
      writeTerminalInput(RUN_SESSION_ID, `${runCmd}\n`);
    } catch (err) {
      console.error("Failed to write run command:", err);
      cb.onLog?.(`Error: Failed to send command: ${err}`);
      return;
    }
    try {
      runningTasksService.addTask({
        command: plan.command,
        port: plan.port,
        url: plan.url,
        workspaceId,
      });
    } catch (_) {}
    cb.onOpenBrowser(plan.url);
    return;
  }

  const runCmd = await prepareRunScript({
    fileName: plan.displayName,
    displayName: plan.displayName,
    runtime: plan.runtime,
    command: plan.command,
    isServer: false,
  });

  cb.onOpenTerminal();
  ideActionService.emit("RUN_IN_TERMINAL", {
    command: runCmd,
    workspaceId,
    userInitiated: true,
  });
}
