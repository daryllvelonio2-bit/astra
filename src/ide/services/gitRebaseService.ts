import { executeCommand } from "../../../modules/linux-runner/src";
import { invalidateGitStatusCache } from "./gitStatusCache";

export interface RebaseState {
  rebasing: boolean;
  /** Short branch name being rebased (from rebase-merge/head-name), if readable. */
  branch?: string;
  /** Currently unmerged (conflicted) paths, capped at 100. */
  conflicted: string[];
}

export interface RebaseOpResult {
  success: boolean;
  message: string;
}

function sq(s: string): string {
  return `'${(s || "").replace(/'/g, `'\\''`)}'`;
}

export function buildRebaseDetectCommand(): string {
  return 'gd=$(git rev-parse --git-dir 2>/dev/null) && { [ -d "$gd/rebase-merge" ] || [ -d "$gd/rebase-apply" ]; } && echo yes || echo no';
}

/** True while a rebase is in progress (rebase-merge / rebase-apply dir present). */
export async function isRebasing(workspaceId?: string): Promise<boolean> {
  try {
    const res = await executeCommand(buildRebaseDetectCommand(), workspaceId);
    return (res.stdout || "").trim() === "yes";
  } catch (_) {
    return false;
  }
}

function shortBranchName(ref: string): string {
  return (ref || "").trim().replace(/^refs\/heads\//, "") || "current branch";
}

export async function getRebaseState(workspaceId?: string): Promise<RebaseState> {
  try {
    if (!(await isRebasing(workspaceId))) return { rebasing: false, conflicted: [] };
    let branch: string | undefined;
    try {
      const h = await executeCommand(
        'gd=$(git rev-parse --git-dir 2>/dev/null); cat "$gd/rebase-merge/head-name" 2>/dev/null || cat "$gd/rebase-apply/head-name" 2>/dev/null || true',
        workspaceId
      );
      const raw = (h.stdout || "").trim();
      if (raw) branch = shortBranchName(raw);
    } catch (_) {}
    let conflicted: string[] = [];
    try {
      const u = await executeCommand("git diff --name-only --diff-filter=U", workspaceId);
      conflicted = (u.stdout || "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 100);
    } catch (_) {}
    return { rebasing: true, branch, conflicted };
  } catch (_) {
    return { rebasing: false, conflicted: [] };
  }
}

/** Start rebasing the current branch onto `target` (branch name, tag, or SHA). */
export async function startRebase(
  workspaceId: string | undefined,
  target: string
): Promise<RebaseOpResult> {
  const onto = (target || "").trim();
  if (!onto) return { success: false, message: "Pick a branch to rebase onto." };
  if (/[\n$`]/.test(onto)) return { success: false, message: "Invalid branch name." };
  try {
    if (await isRebasing(workspaceId)) {
      return { success: false, message: "A rebase is already in progress — finish or abort it first." };
    }
    const res = await executeCommand(`git rebase ${sq(onto)}`, workspaceId);
    invalidateGitStatusCache(workspaceId);
    const out = ((res.stdout || "") + "\n" + ((res as any).stderr || "")).trim();
    if (res.exitCode === 0) return { success: true, message: `Rebased onto ${onto}.` };
    if (/conflict|unmerged|failed to merge/i.test(out)) {
      const u = await executeCommand("git diff --name-only --diff-filter=U | wc -l", workspaceId);
      const n = parseInt((u.stdout || "").trim(), 10) || 0;
      return {
        success: false,
        message:
          `Rebase onto ${onto} stopped with conflicts in ${n} file(s). ` +
          `Resolve each file in the Changes tab, then Continue.`,
      };
    }
    return { success: false, message: out.split(/\r?\n/).pop() || `Could not rebase onto ${onto}.` };
  } catch (e: any) {
    invalidateGitStatusCache(workspaceId);
    return { success: false, message: e?.message || `Could not rebase onto ${onto}.` };
  }
}

/**
 * Continue after resolving conflicts. GIT_EDITOR=true keeps git from opening
 * an editor (which would hang the bridge waiting on input that never comes).
 */
export async function continueRebase(workspaceId?: string): Promise<RebaseOpResult> {
  try {
    const res = await executeCommand("GIT_EDITOR=true git rebase --continue", workspaceId);
    invalidateGitStatusCache(workspaceId);
    const out = ((res.stdout || "") + "\n" + ((res as any).stderr || "")).trim();
    if (res.exitCode === 0) {
      const still = await isRebasing(workspaceId);
      return still
        ? { success: true, message: "Step applied — more conflicts ahead. Keep resolving, then Continue again." }
        : { success: true, message: "Rebase completed." };
    }
    if (/no changes|nothing to commit|already applied/i.test(out)) {
      return {
        success: false,
        message: "That commit is empty after resolving — use Skip to drop it, or Abort to cancel the rebase.",
      };
    }
    return { success: false, message: out.split(/\r?\n/).pop() || "Could not continue the rebase." };
  } catch (e: any) {
    invalidateGitStatusCache(workspaceId);
    return { success: false, message: e?.message || "Could not continue the rebase." };
  }
}

/** Skip the current (conflicted/empty) commit and move to the next one. */
export async function skipRebase(workspaceId?: string): Promise<RebaseOpResult> {
  try {
    const res = await executeCommand("GIT_EDITOR=true git rebase --skip", workspaceId);
    invalidateGitStatusCache(workspaceId);
    const out = ((res.stdout || "") + "\n" + ((res as any).stderr || "")).trim();
    if (res.exitCode !== 0) {
      return { success: false, message: out.split(/\r?\n/).pop() || "Could not skip this commit." };
    }
    const still = await isRebasing(workspaceId);
    return still
      ? { success: true, message: "Skipped — more commits ahead." }
      : { success: true, message: "Rebase completed." };
  } catch (e: any) {
    invalidateGitStatusCache(workspaceId);
    return { success: false, message: e?.message || "Could not skip this commit." };
  }
}

/** Abandon the rebase, restoring the pre-rebase state. */
export async function abortRebase(workspaceId?: string): Promise<RebaseOpResult> {
  try {
    const res = await executeCommand("git rebase --abort", workspaceId);
    invalidateGitStatusCache(workspaceId);
    return res.exitCode === 0
      ? { success: true, message: "Rebase aborted." }
      : { success: false, message: (res.stdout || "").trim() || "Could not abort the rebase." };
  } catch (e: any) {
    invalidateGitStatusCache(workspaceId);
    return { success: false, message: e?.message || "Could not abort the rebase." };
  }
}
