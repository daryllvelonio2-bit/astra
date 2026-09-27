import { useMemo } from "react";
import { fetchTreeCommits } from "../../services/gitHubTreeCommitService";
import { GitHubTreeCommit } from "../../services/gitHubTypes";
import { useGitHubResource } from "./useGitHubResource";

/**
 * Last commit for every path in the current folder. One GraphQL request
 * covers the whole listing (see gitHubTreeCommitService), and failures are
 * silent on purpose: the file list must still render without commit info.
 */
export function useTreeCommits(
  owner: string,
  repo: string,
  ref: string,
  paths: string[]
): Record<string, GitHubTreeCommit | null> {
  const signature = useMemo(() => [...paths].sort().join("|"), [paths]);

  const res = useGitHubResource(
    () => fetchTreeCommits(owner, repo, ref, paths),
    [owner, repo, ref, signature],
    { skip: paths.length === 0 }
  );

  // Failures are deliberately silent in the UI (the file list must still
  // render), so surface them here for the Metro log instead.
  if (res.error) console.log("[github] tree commit info unavailable:", res.error.message);

  return res.data || {};
}
