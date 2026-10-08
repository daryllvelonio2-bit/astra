/**
 * Shared GitHub remote parser.
 *
 * Dependency-free on purpose: the Collaborators feature's pure logic is
 * unit-tested with plain node (no bundler, no React Native), so this parser
 * must not pull in the guest runner or the Expo config layer. gitAvatarService
 * re-exports it, so every existing `import { parseGitHubRepo } from
 * "./gitAvatarService"` keeps working — there is still exactly one parser.
 */

export interface GitHubRepoRef {
  owner: string;
  repo: string;
}

/** Extracts owner/repo from HTTPS, SSH, or shorthand GitHub remotes. */
export function parseGitHubRepo(remoteUrl?: string | null): GitHubRepoRef | null {
  const raw = (remoteUrl || "").trim();
  if (!raw) return null;
  let m = raw.match(/^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i);
  if (m) return { owner: m[1], repo: m[2] };
  m = raw.match(/^(?:git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i);
  if (m) return { owner: m[1], repo: m[2] };
  m = raw.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (m) return { owner: m[1], repo: m[2] };
  return null;
}
