import { executeCommand } from "../../../modules/linux-runner/src";
import { invalidateGitStatusCache } from "./gitService";
import { GitFileStatus } from "../components/git/types";

/**
 * File-level GitHub-Desktop-style operations for the Changes tab:
 * discard, ignore (file / extension), path helpers. All run through the
 * same linux-runner git surface the rest of the Git tab uses.
 */

const q = (p: string) => `"${p.replace(/"/g, '\\"')}"`;

/** Undo all changes to one file, staged and unstaged. Untracked = delete. */
export async function discardFile(
  workspaceId: string | undefined,
  file: GitFileStatus
): Promise<{ success: boolean; message: string }> {
  try {
    if (file.status === "untracked") {
      const res = await executeCommand(`git clean -f -- ${q(file.path)}`, workspaceId);
      invalidateGitStatusCache(workspaceId);
      return res.exitCode === 0
        ? { success: true, message: `Discarded ${file.filename}` }
        : { success: false, message: res.stdout || "Discard failed" };
    }

    // Unstage first so staged + working-tree changes both disappear.
    if (file.staged) {
      await executeCommand(`git reset HEAD -- ${q(file.path)}`, workspaceId);
    }
    // Added (new, staged) files only exist in the index — clean them.
    if (file.status === "added") {
      const res = await executeCommand(`git clean -f -- ${q(file.path)}`, workspaceId);
      invalidateGitStatusCache(workspaceId);
      return res.exitCode === 0
        ? { success: true, message: `Discarded ${file.filename}` }
        : { success: false, message: res.stdout || "Discard failed" };
    }
    if (file.status === "renamed" && file.oldPath) {
      // Undo rename + content: remove new path, restore old path.
      await executeCommand(`git rm -f --quiet ${q(file.path)} || true`, workspaceId);
      const res = await executeCommand(`git checkout -- ${q(file.oldPath)}`, workspaceId);
      invalidateGitStatusCache(workspaceId);
      return res.exitCode === 0
        ? { success: true, message: `Discarded ${file.filename}` }
        : { success: false, message: res.stdout || "Discard failed" };
    }
    // modified / deleted -> restore from HEAD
    const res = await executeCommand(`git checkout -- ${q(file.path)}`, workspaceId);
    invalidateGitStatusCache(workspaceId);
    return res.exitCode === 0
      ? { success: true, message: `Discarded ${file.filename}` }
      : { success: false, message: res.stdout || "Discard failed" };
  } catch (e: any) {
    invalidateGitStatusCache(workspaceId);
    return { success: false, message: e?.message || "Discard failed" };
  }
}

/** Escape a path for .gitignore (spaces need backslash in gitignore files). */
const igEscape = (p: string) => p.replace(/ /g, "\\ ");

/** Append an entry to .gitignore (creates it) unless already present. */
async function appendGitignore(
  workspaceId: string | undefined,
  entry: string
): Promise<{ success: boolean; message: string }> {
  const line = igEscape(entry);
  const check = await executeCommand(
    `test -f .gitignore && grep -qxF ${q(line)} .gitignore && echo YES || echo NO`,
    workspaceId
  );
  if (check.stdout.trim().endsWith("YES")) {
    return { success: true, message: `Already ignored: ${entry}` };
  }
  const res = await executeCommand(`printf '%s\\n' ${q(line)} >> .gitignore`, workspaceId);
  invalidateGitStatusCache(workspaceId);
  return res.exitCode === 0
    ? { success: true, message: `Added to .gitignore: ${entry}` }
    : { success: false, message: "Could not update .gitignore" };
}

/** Ignore this exact file (GitHub Desktop "Ignore file"). */
export async function ignoreFile(
  workspaceId: string | undefined,
  file: GitFileStatus
): Promise<{ success: boolean; message: string }> {
  return appendGitignore(workspaceId, `/${file.path}`);
}

/** Ignore every file sharing this extension (GitHub Desktop "Ignore extension"). */
export async function ignoreExtension(
  workspaceId: string | undefined,
  file: GitFileStatus
): Promise<{ success: boolean; message: string }> {
  const base = file.filename;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return { success: false, message: "File has no extension to ignore" };
  return appendGitignore(workspaceId, `*.${base.slice(dot + 1)}`);
}

/**
 * GitHub blob URL for a file on the current branch, or null when the remote
 * isn't GitHub / inputs are missing. `branch` may be a display name.
 */
export function buildGitHubFileUrl(
  remoteUrl: string | null | undefined,
  branch: string | null | undefined,
  path: string
): string | null {
  if (!remoteUrl || !branch) return null;
  const m = remoteUrl.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?\/?$/);
  if (!m) return null;
  return `https://github.com/${m[1]}/blob/${encodeURIComponent(branch)}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}