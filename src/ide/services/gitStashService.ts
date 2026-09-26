import { executeCommand } from "../../../modules/linux-runner/src";
import { invalidateGitStatusCache } from "./gitStatusCache";

export interface StashEntry {
  /** e.g. `stash@{0}` — validated `stash@{N}` before any use. */
  ref: string;
  /** Full reflog subject, e.g. `On main: my message` / `WIP on main: abc1234 ...`. */
  message: string;
  /** Short display message with the `On <branch>:` prefix stripped when present. */
  shortMessage: string;
  epoch: number;
}

export interface StashOpResult {
  success: boolean;
  message: string;
}

function sq(s: string): string {
  return `'${(s || "").replace(/'/g, `'\\''`)}'`;
}

function isValidRef(ref: string): boolean {
  return /^stash@\{\d+\}$/.test((ref || "").trim());
}

function shortOf(message: string): string {
  const m = (message || "").trim();
  return m.replace(/^(WIP on [^:]+:\s*|On [^:]+:\s*)/, "").trim() || m || "Stash";
}

/**
 * Parse `git stash list --pretty=format:STASH_REC%x1f%gd%x1f%gs%x1f%ct`
 * output. Split on the %x1f unit separator so `|`/`:` in messages survive.
 */
export function parseStashList(stdout: string): StashEntry[] {
  const out: StashEntry[] = [];
  for (const raw of (stdout || "").split(/\r?\n/)) {
    if (!raw.startsWith("STASH_REC\x1f")) continue;
    const parts = raw.split("\x1f");
    const ref = (parts[1] || "").trim();
    const message = (parts[2] || "").trim();
    const epoch = parseInt(parts[3] || "0", 10) || 0;
    if (!isValidRef(ref)) continue;
    out.push({ ref, message: message || "Stash", shortMessage: shortOf(message), epoch });
  }
  return out;
}

export function buildStashListCommand(): string {
  return "git stash list --pretty=format:STASH_REC%x1f%gd%x1f%gs%x1f%ct";
}

export async function listStashes(workspaceId?: string): Promise<StashEntry[]> {
  try {
    const res = await executeCommand(buildStashListCommand(), workspaceId);
    if (res.exitCode !== 0) return [];
    return parseStashList(res.stdout || "");
  } catch (_) {
    return [];
  }
}

export async function saveStash(
  workspaceId: string | undefined,
  message?: string,
  includeUntracked = false
): Promise<StashOpResult> {
  try {
    const msg = (message || "").trim();
    const u = includeUntracked ? " --include-untracked" : "";
    const cmd = msg ? `git stash push -m ${sq(msg)}${u}` : `git stash push${u}`;
    const res = await executeCommand(cmd, workspaceId);
    invalidateGitStatusCache(workspaceId);
    const out = ((res.stdout || "") + "\n" + ((res as any).stderr || "")).trim();
    if (res.exitCode === 0) return { success: true, message: "Stashed." };
    if (/no local changes/i.test(out)) {
      return { success: false, message: "Nothing to stash — the working tree is clean." };
    }
    return { success: false, message: out.split(/\r?\n/).pop() || "Could not stash." };
  } catch (e: any) {
    invalidateGitStatusCache(workspaceId);
    return { success: false, message: e?.message || "Could not stash." };
  }
}

function refOrError(ref: string): string | null {
  return isValidRef(ref) ? (ref || "").trim() : null;
}

export async function applyStash(
  workspaceId: string | undefined,
  ref: string
): Promise<StashOpResult> {
  const r = refOrError(ref);
  if (!r) return { success: false, message: "Invalid stash reference." };
  try {
    const res = await executeCommand(`git stash apply ${r}`, workspaceId);
    invalidateGitStatusCache(workspaceId);
    const out = ((res.stdout || "") + "\n" + ((res as any).stderr || "")).trim();
    return res.exitCode === 0
      ? { success: true, message: `Applied ${r} (kept in the stash).` }
      : { success: false, message: out.split(/\r?\n/).pop() || `Could not apply ${r}.` };
  } catch (e: any) {
    invalidateGitStatusCache(workspaceId);
    return { success: false, message: e?.message || `Could not apply ${r}.` };
  }
}

export async function popStash(
  workspaceId: string | undefined,
  ref: string
): Promise<StashOpResult> {
  const r = refOrError(ref);
  if (!r) return { success: false, message: "Invalid stash reference." };
  try {
    const res = await executeCommand(`git stash pop ${r}`, workspaceId);
    invalidateGitStatusCache(workspaceId);
    const out = ((res.stdout || "") + "\n" + ((res as any).stderr || "")).trim();
    if (res.exitCode === 0) return { success: true, message: `Popped ${r}.` };
    if (/conflict|unmerged|already exists|could not restore/i.test(out)) {
      return {
        success: false,
        message:
          `Popping ${r} hit a conflict — resolve it in the Changes tab, ` +
          `then drop the stash by hand once everything applies cleanly.`,
      };
    }
    return { success: false, message: out.split(/\r?\n/).pop() || `Could not pop ${r}.` };
  } catch (e: any) {
    invalidateGitStatusCache(workspaceId);
    return { success: false, message: e?.message || `Could not pop ${r}.` };
  }
}

export async function dropStash(
  workspaceId: string | undefined,
  ref: string
): Promise<StashOpResult> {
  const r = refOrError(ref);
  if (!r) return { success: false, message: "Invalid stash reference." };
  try {
    const res = await executeCommand(`git stash drop ${r}`, workspaceId);
    invalidateGitStatusCache(workspaceId);
    return res.exitCode === 0
      ? { success: true, message: `Dropped ${r}.` }
      : { success: false, message: (res.stdout || "").trim() || `Could not drop ${r}.` };
  } catch (e: any) {
    invalidateGitStatusCache(workspaceId);
    return { success: false, message: e?.message || `Could not drop ${r}.` };
  }
}

/** File paths touched by a stash (for a preview row before apply/pop). */
export async function getStashFiles(
  workspaceId: string | undefined,
  ref: string
): Promise<string[]> {
  const r = refOrError(ref);
  if (!r) return [];
  try {
    const res = await executeCommand(`git stash show --name-only ${r}`, workspaceId);
    if (res.exitCode !== 0) return [];
    return (res.stdout || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, 100);
  } catch (_) {
    return [];
  }
}
