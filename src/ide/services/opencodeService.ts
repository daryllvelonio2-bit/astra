import { executeCommand } from "../../../modules/linux-runner/src";
import { writeFileText } from "./nativeFs";

/**
 * opencode CLI health + repair (one feature = one file).
 * The `opencode-ai` npm wrapper ships a stub binary until its postinstall
 * downloads the real platform binary. When postinstall never ran
 * (--ignore-scripts, pnpm/bun defaults, offline install), every invocation
 * prints "opencode-ai's postinstall script was not run." This service
 * detects that exact state and repairs it: rerun postinstall in place,
 * else reinstall via npm with scripts forced on, else the official
 * installer (drops into ~/.opencode/bin, already on the session PATH).
 */

export type OpencodeState = "ok" | "broken-postinstall" | "missing" | "unknown";

export interface OpencodeHealth {
  state: OpencodeState;
  version?: string;
  detail: string;
}

export interface RepairResult {
  success: boolean;
  version?: string;
  log: string;
}

const POSTINSTALL_MARKER = /postinstall/i;

function firstLine(text: string, max = 120): string {
  return (text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0]?.slice(0, max) || "";
}

async function queryVersion(): Promise<{ exitCode: number; out: string }> {
  const res = await executeCommand("opencode --version 2>&1");
  return { exitCode: res.exitCode, out: (res.stdout || "").trim() };
}

export async function checkOpencode(): Promise<OpencodeHealth> {
  try {
    const which = await executeCommand("command -v opencode 2>/dev/null");
    if (which.exitCode !== 0 || !(which.stdout || "").trim()) {
      return { state: "missing", detail: "opencode is not installed." };
    }
    const { exitCode, out } = await queryVersion();
    if (POSTINSTALL_MARKER.test(out)) {
      return { state: "broken-postinstall", detail: firstLine(out, 300) };
    }
    if (exitCode !== 0) {
      return { state: "unknown", detail: firstLine(out, 300) || `exited with code ${exitCode}` };
    }
    return { state: "ok", version: firstLine(out, 32), detail: "opencode responds." };
  } catch (e: any) {
    return { state: "unknown", detail: e?.message || "Health check failed." };
  }
}

/**
 * Best-effort export of the repair log to shared storage so it can be
 * pulled over adb (`adb pull /sdcard/Download/opencode-repair.log`).
 * Never fails the repair itself.
 */
export async function exportRepairLog(log: string): Promise<boolean> {
  try {
    const stamped = `opencode repair — ${new Date().toISOString()}\n\n${log}\n`;
    return await writeFileText("/sdcard/Download/opencode-repair.log", stamped);
  } catch (_) {
    return false;
  }
}

async function verifyFixed(): Promise<string | null> {
  try {
    const { exitCode, out } = await queryVersion();
    if (exitCode === 0 && !POSTINSTALL_MARKER.test(out)) return firstLine(out, 32) || "ok";
    return null;
  } catch (_) {
    return null;
  }
}

/**
 * Repairs a broken postinstall step by step, verifying after each.
 * Long-running by design (npm downloads); callers show progress.
 */
export async function repairOpencode(): Promise<RepairResult> {
  const logs: string[] = [];
  const run = async (cmd: string) => {
    const res = await executeCommand(cmd);
    const out = (res.stdout || "").trim();
    logs.push(`$ ${cmd}\n${out.slice(-600)}`);
    return res;
  };

  // 1. Fastest: rerun the skipped postinstall inside the existing module.
  const rootRes = await run("npm root -g 2>/dev/null");
  const modDir = `${(rootRes.stdout || "").trim().split(/\s+/)[0] || ""}/opencode-ai`;
  const probe = await run(`test -f "${modDir}/postinstall.mjs" && echo HAS_POSTINSTALL || echo NO_POSTINSTALL`);
  if ((probe.stdout || "").includes("HAS_POSTINSTALL")) {
    await run(`cd "${modDir}" && node postinstall.mjs 2>&1`);
    const v = await verifyFixed();
    if (v) return { success: true, version: v, log: logs.join("\n\n") };
  }

  // 2. Reinstall via npm with lifecycle scripts explicitly enabled
  // (overrides any ignore-scripts config that broke the first install).
  const installRes = await run("npm install -g --ignore-scripts=false opencode-ai 2>&1");
  const v2 = await verifyFixed();
  if (v2) return { success: true, version: v2, log: logs.join("\n\n") };

  // 2b. npm refuses with EEXIST when a dead orphan stub owns the bin path
  // but no package owns the stub. Remove the orphans, retry once.
  if (/EEXIST|file already exists/i.test(installRes.stdout || "")) {
    const eexistPath = /path (\S+)/.exec(installRes.stdout || "")?.[1] || "/usr/local/bin/opencode";
    await run(`rm -f "${eexistPath}" 2>&1`);
    if (modDir.startsWith("/") && modDir.length > "/opencode-ai".length) {
      await run(`rm -rf "${modDir}" 2>&1`);
    }
    await run("npm install -g --ignore-scripts=false opencode-ai 2>&1");
    const v2b = await verifyFixed();
    if (v2b) return { success: true, version: v2b, log: logs.join("\n\n") };
  }

  // 3. Last resort: official installer — no npm involved, binary lands in
  // ~/.opencode/bin which is already on every session PATH.
  await run("curl -fsSL https://opencode.ai/install 2>/dev/null | bash 2>&1");
  const v3 = await verifyFixed();
  if (v3) return { success: true, version: v3, log: logs.join("\n\n") };

  // 4. The curl binary may be shadowed by the dead npm stub earlier in
  // PATH (/usr/local/bin beats ~/.opencode/bin). The winner is proven
  // broken (verify failed above) and npm disowns it ("up to date"), so
  // remove the orphan file + half-installed module dir directly.
  const winner = await run("command -v opencode 2>/dev/null");
  const winnerPath = (winner.stdout || "").trim().split(/\s+/)[0] || "";
  if (winnerPath && !winnerPath.includes(".opencode")) {
    await run(`rm -f "${winnerPath}" 2>&1`);
    if (modDir.startsWith("/") && modDir.length > "/opencode-ai".length) {
      await run(`rm -rf "${modDir}" 2>&1`);
    }
    const v4 = await verifyFixed();
    if (v4) return { success: true, version: v4, log: logs.join("\n\n") };
  }

  return { success: false, log: logs.join("\n\n") };
}
