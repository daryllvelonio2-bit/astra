import { executeCommand } from "../../../modules/linux-runner/src";
import { invalidateGitStatusCache } from "./gitStatusCache";

export interface ConflictedFile {
  path: string;
  /** First `<<<<<<<` marker line (0 when the file has no markers, e.g. binary or renamed-side conflict). */
  markerLine: number;
}

export interface MergeState {
  merging: boolean;
  files: ConflictedFile[];
}

function sq(s: string): string {
  return `'${(s || "").replace(/'/g, `'\\''`)}'`;
}

/** True while a merge is unresolved (MERGE_HEAD present). */
export async function isMerging(workspaceId?: string): Promise<boolean> {
  try {
    const res = await executeCommand(
      "git rev-parse --verify MERGE_HEAD >/dev/null 2>&1 && echo yes || echo no",
      workspaceId
    );
    return (res.stdout || "").trim() === "yes";
  } catch (_) {
    return false;
  }
}

/**
 * Current merge state: unmerged paths (`git diff --diff-filter=U`) plus the
 * first conflict-marker line per text file (single grep, parsed in JS).
 */
export async function getMergeState(workspaceId?: string): Promise<MergeState> {
  try {
    if (!(await isMerging(workspaceId))) return { merging: false, files: [] };
    const res = await executeCommand("git diff --name-only --diff-filter=U", workspaceId);
    const paths = (res.stdout || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 100);
    if (paths.length === 0) return { merging: true, files: [] };
    const firstLine = new Map<string, number>();
    try {
      const g = await executeCommand(
        `grep -n '^<<<<<<< ' -- ${paths.map(sq).join(" ")} 2>/dev/null || true`,
        workspaceId
      );
      for (const raw of (g.stdout || "").split("\n")) {
        const m = raw.match(/^(.*?):(\d+):<<<<<<< /);
        if (m && !firstLine.has(m[1])) firstLine.set(m[1], parseInt(m[2], 10));
      }
    } catch (_) {}
    return {
      merging: true,
      files: paths.map((p) => ({ path: p, markerLine: firstLine.get(p) || 0 })),
    };
  } catch (_) {
    return { merging: false, files: [] };
  }
}

export async function countUnmerged(workspaceId?: string): Promise<number> {
  return (await getMergeState(workspaceId)).files.length;
}

/** Keep one side for a conflicted file and stage it. */
export async function resolveConflictFile(
  workspaceId: string | undefined,
  path: string,
  side: "ours" | "theirs"
): Promise<{ success: boolean; message: string }> {
  try {
    const flag = side === "ours" ? "--ours" : "--theirs";
    const res = await executeCommand(
      `git checkout ${flag} -- ${sq(path)} && git add -- ${sq(path)}`,
      workspaceId
    );
    invalidateGitStatusCache(workspaceId);
    return res.exitCode === 0
      ? { success: true, message: `Resolved with ${side === "ours" ? "yours" : "theirs"}.` }
      : { success: false, message: res.stdout || "Could not resolve that file." };
  } catch (e: any) {
    invalidateGitStatusCache(workspaceId);
    return { success: false, message: e?.message || "Could not resolve that file." };
  }
}

/** Abandon the merge, restoring the pre-merge state. */
export async function abortMerge(workspaceId?: string): Promise<{ success: boolean; message: string }> {
  try {
    const res = await executeCommand("git merge --abort", workspaceId);
    invalidateGitStatusCache(workspaceId);
    return res.exitCode === 0
      ? { success: true, message: "Merge aborted." }
      : { success: false, message: res.stdout || "Could not abort the merge." };
  } catch (e: any) {
    invalidateGitStatusCache(workspaceId);
    return { success: false, message: e?.message || "Could not abort the merge." };
  }
}

/** Finish the merge once every conflict is resolved (uses git's merge message). */
export async function completeMerge(workspaceId?: string): Promise<{ success: boolean; message: string }> {
  try {
    const remaining = await countUnmerged(workspaceId);
    if (remaining > 0) {
      return { success: false, message: `${remaining} file(s) still need resolving.` };
    }
    const res = await executeCommand("git commit --no-edit", workspaceId);
    invalidateGitStatusCache(workspaceId);
    return res.exitCode === 0
      ? { success: true, message: "Merge completed." }
      : { success: false, message: res.stdout || "Could not complete the merge." };
  } catch (e: any) {
    invalidateGitStatusCache(workspaceId);
    return { success: false, message: e?.message || "Could not complete the merge." };
  }
}
