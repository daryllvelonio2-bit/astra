import { GitRepoStatus } from "../components/git/types";

// Speed: `getGitStatus` spawns PRoot per call and the git tab refreshes it on
// every focus/sync. Cache 2s per workspace; mutators invalidate on change.
const STATUS_TTL_MS = 2000;
const statusCache = new Map<string, { at: number; status: GitRepoStatus }>();

export function getCachedGitStatus(workspaceId?: string): GitRepoStatus | null {
  const cached = statusCache.get(workspaceId || "");
  if (cached && Date.now() - cached.at < STATUS_TTL_MS) return cached.status;
  return null;
}

export function setCachedGitStatus(status: GitRepoStatus, workspaceId?: string): GitRepoStatus {
  statusCache.set(workspaceId || "", { at: Date.now(), status });
  return status;
}

export function invalidateGitStatusCache(workspaceId?: string): void {
  if (workspaceId) statusCache.delete(workspaceId);
  else statusCache.clear();
}
