import { executeCommand } from "../../../modules/linux-runner/src";
import { invalidateGitStatusCache } from "./gitStatusCache";

export type ResetMode = "soft" | "mixed" | "hard";

export interface GitOpResult {
  success: boolean;
  error?: string;
}

function ok(res: { exitCode: number; stdout?: string; stderr?: string }): GitOpResult {
  if (res.exitCode === 0) return { success: true };
  const msg = ((res.stderr || res.stdout || "") + "").trim().split(/\r?\n/).pop();
  return { success: false, error: msg || "Git command failed" };
}

// Single-quote escaping is the only safe way to pass user text (commit
// messages, ref names) through the guest shell.
function sq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export async function getCommitMessage(
  workspaceId: string | undefined,
  hash: string
): Promise<string> {
  const res = await executeCommand(`git log -1 --pretty=%B ${hash}`, workspaceId);
  return (res.stdout || "").trim();
}

export async function amendCommit(
  workspaceId: string | undefined,
  message: string
): Promise<GitOpResult> {
  const res = await executeCommand(`git commit --amend -m ${sq(message)}`, workspaceId);
  invalidateGitStatusCache(workspaceId);
  return ok(res);
}

export async function resetToCommit(
  workspaceId: string | undefined,
  hash: string,
  mode: ResetMode
): Promise<GitOpResult> {
  const res = await executeCommand(`git reset --${mode} ${hash}`, workspaceId);
  invalidateGitStatusCache(workspaceId);
  return ok(res);
}

export async function checkoutCommit(
  workspaceId: string | undefined,
  hash: string
): Promise<GitOpResult> {
  const res = await executeCommand(`git checkout ${hash}`, workspaceId);
  invalidateGitStatusCache(workspaceId);
  return ok(res);
}

export async function revertCommit(
  workspaceId: string | undefined,
  hash: string
): Promise<GitOpResult> {
  const res = await executeCommand(`git revert --no-edit ${hash}`, workspaceId);
  invalidateGitStatusCache(workspaceId);
  return ok(res);
}

export async function cherryPickCommit(
  workspaceId: string | undefined,
  hash: string
): Promise<GitOpResult> {
  const res = await executeCommand(`git cherry-pick ${hash}`, workspaceId);
  invalidateGitStatusCache(workspaceId);
  return ok(res);
}

export async function createBranchFromCommit(
  workspaceId: string | undefined,
  branchName: string,
  hash: string
): Promise<GitOpResult> {
  const res = await executeCommand(`git checkout -b ${sq(branchName)} ${hash}`, workspaceId);
  invalidateGitStatusCache(workspaceId);
  return ok(res);
}

export async function createTag(
  workspaceId: string | undefined,
  tagName: string,
  hash: string
): Promise<GitOpResult> {
  const res = await executeCommand(`git tag ${sq(tagName)} ${hash}`, workspaceId);
  invalidateGitStatusCache(workspaceId);
  return ok(res);
}

/** Map an origin URL (ssh or https) to the commit's GitHub web page. */
export function buildCommitWebUrl(remoteUrl: string | null, hash: string): string | null {
  if (!remoteUrl) return null;
  const m = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (!m) return null;
  return `https://github.com/${m[1]}/${m[2]}/commit/${hash}`;
}