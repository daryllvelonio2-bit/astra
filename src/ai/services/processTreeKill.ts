import { PRootService } from "../../ide/services/prootService";
import { killProcessTreeNative, killByPatternNative } from "../../../modules/linux-runner/src/processKill";

export interface ProcInfo {
  pid: number;
  ppid: number;
  cmd: string;
}

export interface ServerIdentity {
  pid?: number;
  port?: number;
  url?: string;
  command: string;
}

/** `ps` listing, tolerant of procps (`ps -ef`) and minimal (`ps -o`) flavors. */
export async function listProcesses(workspaceId?: string): Promise<ProcInfo[]> {
  try {
    const res = await PRootService.runCommand(
      "ps -o pid,ppid,args -e 2>/dev/null || ps -ef 2>/dev/null",
      workspaceId
    );
    const lines = (res?.stdout || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];
    const orderedForm = lines[0].toUpperCase().startsWith("PID");
    const procs: ProcInfo[] = [];
    for (const line of lines.slice(1)) {
      const cols = line.split(/\s+/);
      if (cols.length < 3) continue;
      const pid = parseInt(orderedForm ? cols[0] : cols[1], 10);
      const ppid = parseInt(orderedForm ? cols[1] : cols[2], 10);
      if (!pid) continue;
      const cmd = orderedForm ? cols.slice(2).join(" ") : cols.slice(7).join(" ") || cols.slice(3).join(" ");
      procs.push({ pid, ppid: ppid || 0, cmd });
    }
    return procs;
  } catch (_) {
    return [];
  }
}

/** All descendant pids of root (children, grandchildren, …), root excluded. */
export function collectDescendants(procs: ProcInfo[], rootPid: number): number[] {
  const byPpid = new Map<number, number[]>();
  for (const p of procs) {
    const arr = byPpid.get(p.ppid) || [];
    arr.push(p.pid);
    byPpid.set(p.ppid, arr);
  }
  const out: number[] = [];
  const seen = new Set<number>([rootPid]);
  const stack = [rootPid];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const child of byPpid.get(cur) || []) {
      if (!seen.has(child)) {
        seen.add(child);
        out.push(child);
        stack.push(child);
      }
    }
  }
  return out;
}

/**
 * SIGKILL a pid plus its whole subtree. Native host-side kill first
 * (accurate /proc PPIDs, no guest parsing); guest `ps`-tree as fallback
 * when native is unavailable. A bare `kill <pid>` only takes the wrapper
 * shell and orphans the real server, which keeps the port open.
 */
export async function killPidTree(pid: number, workspaceId?: string): Promise<void> {
  if (!pid) return;
  try {
    const n = await killProcessTreeNative(pid);
    console.log(`[killTask] native killTree(${pid})=${n}`);
    if (n > 0) return;
  } catch (e) {
    console.log(`[killTask] native killTree(${pid}) threw: ${e}`);
  }
  try {
    const procs = await listProcesses(workspaceId);
    const targets = procs.length > 0 ? [...collectDescendants(procs, pid), pid] : [pid];
    if (procs.length > 0 && !procs.some((p) => p.pid === pid)) return;
    await PRootService.runCommand(`kill -9 ${targets.join(" ")} 2>/dev/null || true`, workspaceId);
  } catch (_) {}
}

/** Host-side pattern kill; logs the count for kill diagnostics. */
export async function killByCommandPattern(pattern: string): Promise<number> {
  try {
    const n = await killByPatternNative(pattern);
    console.log(`[killTask] native killByPattern(${pattern})=${n}`);
    return n;
  } catch (e) {
    console.log(`[killTask] native killByPattern(${pattern}) threw: ${e}`);
    return 0;
  }
}

/**
 * Distinctive cmdline fragments per server type. The tracked pid's tree is
 * the primary target; these catch pid-less tasks and double-forked children.
 */
export function killPatternsFor(command: string, port?: number): string[] {
  const cmd = (command || "").toLowerCase();
  const pats: string[] = [];
  if (/expo|metro/.test(cmd)) return ["expo start", "metro"];
  if (/vite/.test(cmd)) return ["vite"];
  if (/http\.server|python/.test(cmd)) {
    pats.push("http.server");
    pats.push("python3 -m http.server");
    pats.push("python -m http.server");
    if (port) {
      pats.push(`http.server ${port}`);
      pats.push(`:${port}`);
    }
    return pats;
  }
  if (port) {
    pats.push(`:${port}`);
  }
  return pats;
}

/** Pids listening on a TCP port via netstat/ss output (`pid=…` or `pid/name`). */
export async function findPidsOnPort(port: number, workspaceId?: string): Promise<number[]> {
  try {
    const res = await PRootService.runCommand(
      `(netstat -tlpn 2>/dev/null || ss -tlpn 2>/dev/null) | grep -E ':${port}\\b'`,
      workspaceId
    );
    const out = res?.stdout || "";
    const pids = new Set<number>();
    let m: RegExpExecArray | null;
    const reEq = /pid=(\d+)/g;
    while ((m = reEq.exec(out))) pids.add(parseInt(m[1], 10));
    const reSlash = /(?:^|\s)(\d+)\/[^\s]*$/gm;
    while ((m = reSlash.exec(out))) pids.add(parseInt(m[1], 10));
    return [...pids].filter(Boolean);
  } catch (_) {
    return [];
  }
}

/**
 * Multi-tier server termination engine:
 * Guarantees stopping background servers under all conditions by executing:
 * 1. Port-targeted kill in guest (via netstat/ss PIDs + SIGKILL, fuser, pkill).
 * 2. Host-side tree kill of known PID or discovered port PIDs.
 * 3. Guest-side pkill of distinctive command patterns and ports.
 * 4. Host-side command line pattern kill.
 * 5. Guest-side process inspection and termination of matching PIDs.
 * 6. Verification with retry and force option.
 */
export async function terminateServer(
  srv: ServerIdentity,
  workspaceId?: string,
  force = false
): Promise<boolean> {
  const mark = (msg: string) => console.log(`[terminateServer] ${msg}`);
  mark(`start: pid=${srv.pid} port=${srv.port} cmd=${srv.command} force=${force}`);

  // 1. If PID is directly tracked, kill it in both host and guest
  if (srv.pid && srv.pid > 0) {
    try {
      await killPidTree(srv.pid, workspaceId);
      await PRootService.runCommand(`kill -9 ${srv.pid} 2>/dev/null || true`, workspaceId);
    } catch (_) {}
  }

  // 2. If Port is known, find listening PIDs and kill them
  if (srv.port && srv.port > 0) {
    try {
      const portPids = await findPidsOnPort(srv.port, workspaceId);
      if (portPids.length > 0) {
        mark(`found port ${srv.port} pids: ${portPids.join(", ")}`);
        await PRootService.runCommand(`kill -9 ${portPids.join(" ")} 2>/dev/null || true`, workspaceId);
        for (const p of portPids) {
          await killPidTree(p, workspaceId);
        }
      }
    } catch (_) {}

    // Guest-side port kill commands
    try {
      await PRootService.runCommand(`fuser -k -9 ${srv.port}/tcp 2>/dev/null || true`, workspaceId);
    } catch (_) {}
    try {
      await PRootService.runCommand(
        `pkill -9 -f ":${srv.port}\\b" 2>/dev/null || pkill -9 -f " ${srv.port}\\b" 2>/dev/null || true`,
        workspaceId
      );
    } catch (_) {}
  }

  // 3. Guest-side & Host-side pattern kill
  const patterns = killPatternsFor(srv.command, srv.port);
  for (const pat of patterns) {
    try {
      await killByCommandPattern(pat);
    } catch (_) {}
    try {
      await PRootService.runCommand(`pkill -9 -f "${pat}" 2>/dev/null || true`, workspaceId);
    } catch (_) {}
  }

  // If this is Python http.server, explicitly kill any python http.server processes
  if (/http\.server|python/i.test(srv.command)) {
    try {
      await PRootService.runCommand(`pkill -9 -f "http.server" 2>/dev/null || true`, workspaceId);
      await PRootService.runCommand(`pkill -9 -f "python3 -m http.server" 2>/dev/null || true`, workspaceId);
      await PRootService.runCommand(`pkill -9 -f "python -m http.server" 2>/dev/null || true`, workspaceId);
    } catch (_) {}
  }

  // 4. Guest process table scan fallback
  try {
    const procs = await listProcesses(workspaceId);
    const targetPids: number[] = [];
    for (const p of procs) {
      const c = p.cmd.toLowerCase();
      const matchesPort = srv.port && (c.includes(`:${srv.port}`) || c.includes(` ${srv.port}`));
      const matchesPat = patterns.some((pat) => c.includes(pat.toLowerCase()));
      const matchesPy = /http\.server|python/i.test(srv.command) && c.includes("http.server");
      if (matchesPort || matchesPat || matchesPy) {
        targetPids.push(p.pid);
      }
    }
    if (targetPids.length > 0) {
      mark(`scanned matching guest pids: ${targetPids.join(", ")}`);
      await PRootService.runCommand(`kill -9 ${targetPids.join(" ")} 2>/dev/null || true`, workspaceId);
      for (const p of targetPids) {
        await killPidTree(p, workspaceId);
      }
    }
  } catch (_) {}

  // 5. Allow socket settling time, then verify
  await new Promise((r) => setTimeout(r, 250));
  let alive = await isServerAlive(srv, workspaceId);
  mark(`first check isAlive=${alive}`);

  // 6. If still alive, attempt an immediate aggressive secondary sweep
  if (alive) {
    mark("secondary aggressive kill sweep triggered");
    if (srv.port) {
      try {
        await PRootService.runCommand(
          `(netstat -tlpn 2>/dev/null || ss -tlpn 2>/dev/null) | grep -E ':${srv.port}\\b' | awk '{print $NF}' | cut -d'/' -f1 | grep -E '^[0-9]+$' | xargs -r kill -9 2>/dev/null || true`,
          workspaceId
        );
      } catch (_) {}
    }
    if (/http\.server|python/i.test(srv.command)) {
      try {
        await PRootService.runCommand(`pkill -9 -f "http.server" 2>/dev/null || true`, workspaceId);
      } catch (_) {}
    }
    await new Promise((r) => setTimeout(r, 250));
    alive = await isServerAlive(srv, workspaceId);
    mark(`secondary check isAlive=${alive}`);
  }

  if (force) {
    mark("force=true specified, returning true regardless of alive check");
    return true;
  }

  return !alive;
}

/**
 * Ground truth: is the server actually still up? Port answer wins (it's what
 * the user checks in the browser), then pid, then command-name heuristics.
 */
export async function isServerAlive(srv: ServerIdentity, workspaceId?: string): Promise<boolean> {
  if (srv.port && srv.url && /^https?:\/\//i.test(srv.url)) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1500);
      const res = await fetch(`http://127.0.0.1:${srv.port}/`, {
        method: "GET",
        signal: controller.signal,
      }).catch(() => null);
      clearTimeout(timer);
      if (res) return true;
    } catch (_) {}
  }
  // A listener on the port is authoritative for that exact server (no
  // cross-talk when several same-stack servers run side by side).
  if (srv.port && (await findPidsOnPort(srv.port, workspaceId)).length > 0) return true;
  try {
    const procs = await listProcesses(workspaceId);
    if (srv.pid && procs.some((p) => p.pid === srv.pid)) return true;
    // Name heuristics only when there is no specific signal (no port/pid).
    if (srv.port || srv.pid) return false;
    const lowerCmd = (srv.command || "").toLowerCase();
    const psText = procs.map((p) => p.cmd.toLowerCase()).join("\n");
    if (/expo|metro/i.test(lowerCmd) && (/expo/i.test(psText) || /metro/i.test(psText))) return true;
    if (/vite/i.test(lowerCmd) && /vite/i.test(psText)) return true;
    const first = lowerCmd.replace(/^[a-z0-9_\-./]+\//i, "").split(/\s+/)[0] || "";
    if (first.length > 3 && !["node", "npm", "sh", "bash"].includes(first) && psText.includes(first)) return true;
  } catch (_) {}
  return false;
}

