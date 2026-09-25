import { executeCommand } from "../../../modules/linux-runner/src";
import { GitBranch, GitCommit, GitCommitFile, GitFileStatus, GitRepoStatus } from "../components/git/types";
import {
  getCachedGitStatus,
  setCachedGitStatus,
  invalidateGitStatusCache,
} from "./gitStatusCache";

// Remote/credential ops live in gitRemoteService (one feature = one file);
// re-exported here so existing callers keep importing from gitService.
export {
  configureGitCredentials,
  getSshPublicKey,
  generateSshKey,
  getGitRemoteUrl,
  setGitRemoteUrl,
} from "./gitRemoteService";
export {
  startGitHubDeviceFlow,
  waitForDeviceFlowApproval,
  completeGitHubLogin,
  loadGitHubSession,
  ensureGitHubCredentials,
  logoutGitHub,
} from "./gitHubAuthService";
export type { GitHubSession, DeviceFlowSession } from "./gitHubAuthService";
export { invalidateGitStatusCache };

function formatRelativeTime(epochSeconds: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - epochSeconds));
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(epochSeconds * 1000).toLocaleDateString();
}

export async function checkIsGitRepo(workspaceId?: string): Promise<boolean> {
  try {
    const res = await executeCommand("git rev-parse --is-inside-work-tree", workspaceId);
    return (res.stdout || "").trim() === "true";
  } catch (_) {
    return false;
  }
}

export async function initGitRepo(workspaceId?: string): Promise<boolean> {
  try {
    const res = await executeCommand("git init && git branch -M main", workspaceId);
    invalidateGitStatusCache(workspaceId);
    return res.exitCode === 0;
  } catch (_) {
    invalidateGitStatusCache(workspaceId);
    return false;
  }
}

export async function getGitStatus(workspaceId?: string): Promise<GitRepoStatus> {
  const cached = getCachedGitStatus(workspaceId);
  if (cached) return cached;
  const store = (status: GitRepoStatus): GitRepoStatus =>
    setCachedGitStatus(status, workspaceId);

  // Single spawn: `git status` exit code already tells repo vs non-repo,
  // so the separate `rev-parse --is-inside-work-tree` probe is skipped.
  try {
    const res = await executeCommand("git status --porcelain=v1 -b", workspaceId);
    const combined = `${res.stdout || ""}\n${(res as any).stderr || ""}`;
    if (res.exitCode !== 0 && /not a git repository|not a git repo/i.test(combined)) {
      return store({
        isRepo: false,
        currentBranch: "none",
        detached: false,
        ahead: 0,
        behind: 0,
        files: [],
      });
    }
    const lines = (res.stdout || "").split(/\r?\n/).filter(Boolean);

    let currentBranch = "main";
    let upstreamBranch: string | undefined;
    let detached = false;
    let ahead = 0;
    let behind = 0;
    const files: GitFileStatus[] = [];

    if (lines.length > 0 && lines[0].startsWith("##")) {
      const header = lines[0].replace(/^##\s*/, "");
      if (header.includes("No commits yet on ")) {
        currentBranch = header.replace("No commits yet on ", "").trim();
      } else if (header.includes("Initial commit on ")) {
        currentBranch = header.replace("Initial commit on ", "").trim();
      } else if (header === "HEAD" || header.startsWith("HEAD ")) {
        // Detached HEAD (e.g. checked out a remote ref directly): there is no
        // branch to commit to or push from, so report no ahead/behind.
        detached = true;
        currentBranch = "HEAD";
      } else {
        const match = header.match(/^([^\s.]+)(?:\.\.\.([^\s]+))?(?:\s+\[ahead\s+(\d+)(?:,\s*behind\s+(\d+))?\]|\s+\[behind\s+(\d+)\])?/);
        if (match) {
          currentBranch = match[1] || "main";
          upstreamBranch = match[2];
          ahead = match[3] ? parseInt(match[3], 10) : 0;
          behind = match[4] ? parseInt(match[4], 10) : match[5] ? parseInt(match[5], 10) : 0;
        }
      }
    }

    // No upstream in the header: only count ahead of a same-name remote
    // branch (local branch simply not tracking yet). Never fall back to
    // counting all of HEAD — with nowhere to push, that number is fiction.
    // Detached HEAD reports no counts at all.
    if (!upstreamBranch && !detached) {
      try {
        const countCmd = `git rev-parse --verify "origin/${currentBranch}" >/dev/null 2>&1 && (git rev-list --left-right --count "HEAD...origin/${currentBranch}" && git branch --set-upstream-to="origin/${currentBranch}" "${currentBranch}" >/dev/null 2>&1) || (git rev-list --count HEAD 2>/dev/null || echo 0)`;
        const countRes = await executeCommand(countCmd, workspaceId);
        const out = (countRes.stdout || "").trim();
        if (out.includes("\t")) {
          const [aStr, bStr] = out.split(/\s+/);
          ahead = parseInt(aStr, 10) || 0;
          behind = parseInt(bStr, 10) || 0;
          upstreamBranch = `origin/${currentBranch}`;
        } else {
          const parsed = parseInt(out, 10);
          if (!isNaN(parsed) && parsed > 0) ahead = parsed;
        }
      } catch (_) {}
    }

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.length < 3) continue;
      const x = line[0];
      const y = line[1];
      const pathPart = line.slice(3).trim();

      let path = pathPart;
      let oldPath: string | undefined;
      if (pathPart.includes(" -> ")) {
        const parts = pathPart.split(" -> ");
        oldPath = parts[0];
        path = parts[1];
      }

      const filename = path.split("/").pop() || path;
      const isStaged = x !== " " && x !== "?";
      let status: GitFileStatus["status"] = "modified";

      if (x === "?" && y === "?") {
        status = "untracked";
      } else if (x === "A" || y === "A") {
        status = "added";
      } else if (x === "D" || y === "D") {
        status = "deleted";
      } else if (x === "R" || y === "R") {
        status = "renamed";
      } else {
        status = "modified";
      }

      files.push({
        path,
        filename,
        status,
        staged: isStaged,
        oldPath,
      });
    }

    return store({
      isRepo: true,
      currentBranch,
      upstreamBranch,
      detached,
      ahead,
      behind,
      files,
    });
  } catch (_) {
    return store({
      isRepo: true,
      currentBranch: "main",
      detached: false,
      ahead: 0,
      behind: 0,
      files: [],
    });
  }
}

export async function getGitFileDiff(
  workspaceId: string | undefined,
  filePath: string,
  staged: boolean
): Promise<string> {
  try {
    const cachedFlag = staged ? "--cached" : "";
    const res = await executeCommand(
      `git diff ${cachedFlag} -- "${filePath}"`,
      workspaceId
    );
    const diff = (res.stdout || "").trim();
    if (diff) return diff;

    // Fallback for untracked new files
    const untrackedRes = await executeCommand(
      `git diff --no-index /dev/null "${filePath}" 2>/dev/null || true`,
      workspaceId
    );
    const untrackedDiff = (untrackedRes.stdout || "").trim();
    if (untrackedDiff) return untrackedDiff;

    // Fallback if file is empty or git diff --no-index produced nothing
    const catRes = await executeCommand(`cat "${filePath}" 2>/dev/null`, workspaceId);
    if (catRes.exitCode === 0) {
      const rawContent = catRes.stdout || "";
      if (rawContent.trim().length === 0) {
        return "Empty file (no content).";
      }
      const lines = rawContent.split(/\r?\n/);
      return `--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${lines.length} @@\n` +
        lines.map((l) => `+${l}`).join("\n");
    }
    return "No changes detected.";
  } catch (e: any) {
    return `Error loading diff: ${e?.message || e}`;
  }
}

export async function stageGitFile(
  workspaceId: string | undefined,
  filePath: string
): Promise<boolean> {
  try {
    const ok = (await executeCommand(`git add -- "${filePath}"`, workspaceId)).exitCode === 0;
    invalidateGitStatusCache(workspaceId);
    return ok;
  } catch (_) { invalidateGitStatusCache(workspaceId); return false; }
}

export async function unstageGitFile(
  workspaceId: string | undefined,
  filePath: string
): Promise<boolean> {
  try {
    const ok = (await executeCommand(`git restore --staged -- "${filePath}" 2>/dev/null || git reset HEAD -- "${filePath}" 2>/dev/null`, workspaceId)).exitCode === 0;
    invalidateGitStatusCache(workspaceId);
    return ok;
  } catch (_) { invalidateGitStatusCache(workspaceId); return false; }
}

export async function stageAllGitFiles(workspaceId?: string): Promise<boolean> {
  try {
    const ok = (await executeCommand("git add -A", workspaceId)).exitCode === 0;
    invalidateGitStatusCache(workspaceId);
    return ok;
  } catch (_) { invalidateGitStatusCache(workspaceId); return false; }
}

export async function unstageAllGitFiles(workspaceId?: string): Promise<boolean> {
  try {
    const ok = (await executeCommand("git restore --staged . 2>/dev/null || git reset HEAD . 2>/dev/null", workspaceId)).exitCode === 0;
    invalidateGitStatusCache(workspaceId);
    return ok;
  } catch (_) { invalidateGitStatusCache(workspaceId); return false; }
}

export async function commitGitChanges(
  workspaceId: string | undefined,
  summary: string,
  description?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanSummary = summary.replace(/"/g, '\\"');
    const descArg = description?.trim()
      ? ` -m "${description.trim().replace(/"/g, '\\"')}"`
      : "";
    const res = await executeCommand(
      `git commit -m "${cleanSummary}"${descArg}`,
      workspaceId
    );
    invalidateGitStatusCache(workspaceId);
    if (res.exitCode === 0) return { success: true };
    return { success: false, error: res.stdout || "Commit failed" };
  } catch (e: any) {
    invalidateGitStatusCache(workspaceId);
    return { success: false, error: e?.message || "Commit failed" };
  }
}

export async function getGitCommitHistory(
  workspaceId?: string,
  limit = 50
): Promise<GitCommit[]> {
  try {
    const res = await executeCommand(
      `branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main"); git log -n ${limit} --pretty=format:"COMMIT_REC|%H|%h|%an|%ae|%at|%s" --shortstat HEAD --remotes="*/$branch"`,
      workspaceId
    );
    if (res.exitCode !== 0) return [];
    const parts = (res.stdout || "").split("COMMIT_REC|").filter(Boolean);
    return parts.map((part): GitCommit | null => {
      const lines = part.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length === 0) return null;
      const [hash, shortHash, authorName, authorEmail, epochStr, message] = lines[0].split("|");
      const timestamp = parseInt(epochStr || "0", 10);
      let additions = 0, deletions = 0, filesChanged = 0;
      for (let i = 1; i < lines.length; i++) {
        const m = lines[i].match(/(\d+)\s+file[s]?\s+changed(?:,\s*(\d+)\s+insertion[s]?\(\+\))?(?:,\s*(\d+)\s+deletion[s]?\(-\))?/);
        if (m) {
          filesChanged = parseInt(m[1] || "0", 10);
          additions = parseInt(m[2] || "0", 10);
          deletions = parseInt(m[3] || "0", 10);
          break;
        }
      }
      const status: "Modified" | "New" | "Deleted" = additions > 0 && deletions === 0 ? "New" : (deletions > 0 && additions === 0 ? "Deleted" : "Modified");
      return {
        hash: hash || "",
        shortHash: shortHash || "",
        authorName: authorName || "Unknown",
        authorEmail: authorEmail || "",
        timestamp,
        message: message || "No commit message",
        relativeTime: formatRelativeTime(timestamp),
        additions,
        deletions,
        filesChanged,
        status,
      };
    }).filter((c): c is GitCommit => c !== null);
  } catch (_) {
    return [];
  }
}

export async function getGitCommitFiles(
  workspaceId: string | undefined,
  hash: string
): Promise<GitCommitFile[]> {
  try {
    const res = await executeCommand(`git show --name-status --pretty="" ${hash}`, workspaceId);
    if (res.exitCode !== 0) return [];
    return (res.stdout || "").split(/\r?\n/).map((line) => {
      const parts = line.trim().split(/\t+/);
      if (parts.length < 2) return null;
      const code = parts[0]?.charAt(0).toUpperCase() || "M";
      const filePath = parts[parts.length - 1] || "";
      const filename = filePath.split("/").pop() || filePath;
      const status: GitCommitFile["status"] = code === "A" ? "added" : code === "D" ? "deleted" : code === "R" ? "renamed" : "modified";
      return { path: filePath, filename, status };
    }).filter((f): f is GitCommitFile => Boolean(f && f.path));
  } catch (_) {
    return [];
  }
}

export async function getGitCommitDiff(
  workspaceId: string | undefined,
  hash: string,
  filePath?: string
): Promise<string> {
  try {
    const fileArg = filePath ? ` -- "${filePath}"` : "";
    const res = await executeCommand(`git show --patch ${hash}${fileArg}`, workspaceId);
    return res.stdout || "No commit diff available.";
  } catch (e: any) {
    return `Error loading commit: ${e?.message || e}`;
  }
}

export async function getGitBranches(workspaceId?: string): Promise<GitBranch[]> {
  try {
    const res = await executeCommand("git branch -a", workspaceId);
    if (res.exitCode !== 0) return [];
    return (res.stdout || "").split(/\r?\n/).filter(Boolean).flatMap((line) => {
      const trimmed = line.trim();
      // Skip the origin/HEAD -> origin/main symlink pointer and the
      // "(HEAD detached at ...)" pseudo-entry: neither is a real branch and
      // checking either out would detach (or fail to attach) HEAD.
      if (/^remotes\/origin\/HEAD\b/.test(trimmed) || trimmed.includes("->")) return [];
      if (/^\(\s*HEAD detached/i.test(trimmed.replace(/^\*\s*/, ""))) return [];
      return [{
        name: trimmed.replace(/^\*\s*/, "").replace(/^remotes\//, ""),
        isCurrent: line.startsWith("*"),
        isRemote: trimmed.startsWith("remotes/"),
      }];
    });
  } catch (_) {
    return [];
  }
}

export async function switchGitBranch(
  workspaceId: string | undefined,
  branchName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Never checkout a remote ref directly — that detaches HEAD. Strip the
    // origin/ prefix so git resolves/creates the local tracking branch.
    const local = branchName.replace(/^origin\//, "").trim();
    if (!local) return { success: false, error: "Invalid branch name" };
    const res = await executeCommand(`git checkout "${local}"`, workspaceId);
    invalidateGitStatusCache(workspaceId);
    return res.exitCode === 0 ? { success: true } : { success: false, error: res.stdout || "Branch switch failed" };
  } catch (e: any) {
    invalidateGitStatusCache(workspaceId);
    return { success: false, error: e?.message || "Branch switch failed" };
  }
}

export async function createGitBranch(
  workspaceId: string | undefined,
  branchName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await executeCommand(`git checkout -b "${branchName}"`, workspaceId);
    invalidateGitStatusCache(workspaceId);
    return res.exitCode === 0 ? { success: true } : { success: false, error: res.stdout || "Failed to create branch" };
  } catch (e: any) {
    invalidateGitStatusCache(workspaceId);
    return { success: false, error: e?.message || "Failed to create branch" };
  }
}

export async function fetchGitRemote(workspaceId?: string): Promise<{ success: boolean; message: string }> {
  try {
    const res = await executeCommand("git fetch --all --prune", workspaceId);
    await executeCommand(
      'branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null); [ -n "$branch" ] && [ "$branch" != "HEAD" ] && git rev-parse --verify "origin/$branch" >/dev/null 2>&1 && git branch --set-upstream-to="origin/$branch" "$branch" >/dev/null 2>&1 || true',
      workspaceId
    );
    invalidateGitStatusCache(workspaceId);
    return { success: res.exitCode === 0, message: res.stdout || (res.exitCode === 0 ? "Fetched from remote" : "Fetch failed") };
  } catch (e: any) {
    invalidateGitStatusCache(workspaceId);
    return { success: false, message: e?.message || "Fetch failed" };
  }
}

export async function pullGitRemote(
  workspaceId?: string,
  branchName?: string
): Promise<{ success: boolean; message: string }> {
  try {
    let res = await executeCommand("git pull", workspaceId);
    if (res.exitCode !== 0) {
      const branch = branchName || "main";
      res = await executeCommand(`git pull origin "${branch}"`, workspaceId);
    }
    invalidateGitStatusCache(workspaceId);
    return { success: res.exitCode === 0, message: res.stdout || (res.exitCode === 0 ? "Pulled latest changes" : "Pull failed") };
  } catch (e: any) {
    invalidateGitStatusCache(workspaceId);
    return { success: false, message: e?.message || "Pull failed" };
  }
}

export async function pushGitRemote(
  workspaceId?: string,
  branchName?: string
): Promise<{ success: boolean; message: string }> {
  try {
    let res = await executeCommand("git push", workspaceId);
    if (res.exitCode === 0) {
      invalidateGitStatusCache(workspaceId);
      return { success: true, message: "Pushed commits to remote" };
    }
    const branch = branchName || "main";
    res = await executeCommand(`git push -u origin "${branch}"`, workspaceId);
    invalidateGitStatusCache(workspaceId);
    return { success: res.exitCode === 0, message: res.exitCode === 0 ? "Pushed commits to remote" : (res.stdout || "Push failed") };
  } catch (e: any) {
    invalidateGitStatusCache(workspaceId);
    return { success: false, message: e?.message || "Push failed" };
  }
}
