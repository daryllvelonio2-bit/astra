import { ghGet, ghGetText, ghList, GitHubResult } from "./gitHubApi";
import {
  GitHubBranchInfo,
  GitHubCommitDetail,
  GitHubCommitSummary,
  GitHubContentEntry,
  GitHubFileText,
  GitHubRelease,
  GitHubRepo,
  GitHubUserSummary,
} from "./gitHubTypes";

/**
 * Repository-scoped reads: repos, branches, contents, commits, releases,
 * contributors. Writes (create/edit/delete) live in gitHubRepoWriteService.
 */

function truncated(message: string): string {
  return message.length > 160 ? `${message.slice(0, 157)}...` : message;
}

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function mapRepo(json: any): GitHubRepo {
  const owner = json?.owner || {};
  return {
    id: json?.id ?? 0,
    name: json?.name || "",
    fullName: json?.full_name || json?.name || "",
    owner: owner.login || "",
    ownerAvatar: owner.avatar_url || "",
    description: (json?.description || "").trim(),
    isPrivate: !!json?.private,
    isFork: !!json?.fork,
    isArchived: !!json?.archived,
    language: json?.language || "",
    stars: json?.stargazers_count ?? 0,
    forks: json?.forks_count ?? 0,
    watchers: json?.subscribers_count ?? json?.watchers_count ?? 0,
    openIssues: json?.open_issues_count ?? 0,
    topics: asArray(json?.topics),
    license: json?.license?.spdx_id || json?.license?.name || "",
    homepage: json?.homepage || "",
    visibility: json?.visibility || (json?.private ? "private" : "public"),
    defaultBranch: json?.default_branch || "main",
    updatedAt: json?.updated_at || "",
    pushedAt: json?.pushed_at || "",
    htmlUrl: json?.html_url || "",
    cloneUrl: json?.clone_url || (json?.full_name ? `https://github.com/${json.full_name}.git` : ""),
    sizeKb: json?.size ?? 0,
  };
}

export function mapGitHubRepo(json: any): GitHubRepo {
  return mapRepo(json);
}

function mapBranch(json: any): GitHubBranchInfo {
  return {
    name: json?.name || "",
    sha: json?.commit?.sha || json?.sha || "",
    isProtected: !!json?.protected,
  };
}

function mapContentEntry(json: any): GitHubContentEntry {
  return {
    name: json?.name || "",
    path: json?.path || "",
    type: json?.type || "file",
    size: json?.size ?? 0,
    htmlUrl: json?.html_url || "",
    downloadUrl: json?.download_url || "",
  };
}

function mapCommit(json: any): GitHubCommitSummary {
  const commit = json?.commit || {};
  const message = (commit.message || "").split("\n")[0] || "No message";
  return {
    sha: json?.sha || "",
    shortSha: (json?.sha || "").slice(0, 7),
    message,
    authorName: commit.author?.name || json?.author?.login || "Unknown",
    authorLogin: json?.author?.login || "",
    authorAvatar: json?.author?.avatar_url || "",
    date: commit.author?.date || commit.committer?.date || "",
    htmlUrl: json?.html_url || "",
  };
}

function mapRelease(json: any): GitHubRelease {
  return {
    id: json?.id ?? 0,
    tagName: json?.tag_name || "",
    name: json?.name || json?.tag_name || "",
    body: json?.body || "",
    isDraft: !!json?.draft,
    isPrerelease: !!json?.prerelease,
    createdAt: json?.created_at || "",
    publishedAt: json?.published_at || "",
    htmlUrl: json?.html_url || "",
    authorLogin: json?.author?.login || "",
    authorAvatar: json?.author?.avatar_url || "",
  };
}

function mapUser(json: any): GitHubUserSummary {
  return {
    login: json?.login || "",
    name: json?.name || "",
    avatarUrl: json?.avatar_url || "",
    htmlUrl: json?.html_url || "",
    kind: json?.type || "User",
  };
}

/** The signed-in user's repos. `affiliation` keeps collaborators in scope. */
export async function fetchMyRepos(
  sort: "updated" | "pushed" | "full_name" | "created" = "updated",
  limit = 100
): Promise<GitHubResult<GitHubRepo[]>> {
  const res = await ghList<any>("/user/repos", {
    per_page: Math.min(100, Math.max(1, limit)),
    sort,
    affiliation: "owner,collaborator,organization_member",
  });
  if (!res.ok) return res;
  return { ok: true, data: res.data.map(mapRepo) };
}

/** Repos owned by any user or org — the "not just mine" path. */
export async function fetchReposForOwner(
  owner: string,
  limit = 100
): Promise<GitHubResult<GitHubRepo[]>> {
  const handle = (owner || "").trim();
  if (!handle) return { ok: true, data: [] };

  const userRes = await ghList<any>(`/users/${encodeURIComponent(handle)}/repos`, {
    per_page: Math.min(100, Math.max(1, limit)),
    sort: "updated",
  });
  if (userRes.ok) return { ok: true, data: userRes.data.map(mapRepo) };

  const orgRes = await ghList<any>(`/orgs/${encodeURIComponent(handle)}/repos`, {
    per_page: Math.min(100, Math.max(1, limit)),
    sort: "updated",
  });
  if (orgRes.ok) return { ok: true, data: orgRes.data.map(mapRepo) };

  return { ok: false, error: userRes.error };
}

/** Repos the signed-in user starred. */
export async function fetchStarredRepos(limit = 100): Promise<GitHubResult<GitHubRepo[]>> {
  const res = await ghList<any>("/user/starred", {
    per_page: Math.min(100, Math.max(1, limit)),
    sort: "updated",
  });
  if (!res.ok) return res;
  return { ok: true, data: res.data.map(mapRepo) };
}

export async function fetchRepo(owner: string, repo: string): Promise<GitHubResult<GitHubRepo>> {
  const res = await ghGet<any>(`/repos/${owner}/${repo}`);
  if (!res.ok) return res;
  return { ok: true, data: mapRepo(res.data) };
}

export async function fetchBranches(
  owner: string,
  repo: string,
  limit = 100
): Promise<GitHubResult<GitHubBranchInfo[]>> {
  const res = await ghList<any>(`/repos/${owner}/${repo}/branches`, {
    per_page: Math.min(100, Math.max(1, limit)),
  });
  if (!res.ok) return res;
  return { ok: true, data: res.data.map(mapBranch) };
}

/** Directory listing, or a single file entry when `path` points at a file. */
export async function fetchContents(
  owner: string,
  repo: string,
  path = "",
  ref?: string
): Promise<GitHubResult<GitHubContentEntry[]>> {
  const res = await ghGet<any>(`/repos/${owner}/${repo}/contents/${path}`, { params: { ref } });
  if (!res.ok) return { ok: false, error: res.error };
  const body = res.data;
  if (Array.isArray(body)) return { ok: true, data: body.map(mapContentEntry) };
  if (body && typeof body === "object" && body.type) {
    return { ok: true, data: [mapContentEntry(body)] };
  }
  return { ok: true, data: [] };
}

/** Raw file text (no base64 decode needed — served with the raw media type). */
export async function fetchFileText(
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<GitHubResult<GitHubFileText>> {
  const res = await ghGetText(`/repos/${owner}/${repo}/contents/${path}`, {
    accept: "application/vnd.github.raw",
    params: { ref },
  });
  if (!res.ok) return { ok: false, error: res.error };
  const text = res.data || "";
  return {
    ok: true,
    data: {
      path,
      name: path.split("/").pop() || path,
      size: text.length,
      text,
      truncated: text.length > 200000,
      htmlUrl: `https://github.com/${owner}/${repo}/blob/${ref || "HEAD"}/${path}`,
    },
  };
}

export async function fetchCommits(
  owner: string,
  repo: string,
  options?: { ref?: string; path?: string; limit?: number }
): Promise<GitHubResult<GitHubCommitSummary[]>> {
  const res = await ghList<any>(`/repos/${owner}/${repo}/commits`, {
    per_page: Math.min(100, Math.max(1, options?.limit ?? 40)),
    sha: options?.ref,
    path: options?.path,
  });
  if (!res.ok) return res;
  return { ok: true, data: res.data.map(mapCommit) };
}

/** Real line counts for a commit: the API `stats` block when present
 *  (null on merge commits), else the sum of the per-file counts. */
function commitLineStats(json: any, files: any[]): { additions: number; deletions: number } {
  const stats = json?.stats;
  if (typeof stats?.additions === "number" && typeof stats?.deletions === "number") {
    return { additions: stats.additions, deletions: stats.deletions };
  }
  let additions = 0;
  let deletions = 0;
  for (const f of files) {
    if (typeof f?.additions === "number") additions += f.additions;
    if (typeof f?.deletions === "number") deletions += f.deletions;
  }
  return { additions, deletions };
}

export async function fetchCommit(
  owner: string,
  repo: string,
  sha: string
): Promise<GitHubResult<GitHubCommitDetail>> {
  const res = await ghGet<any>(`/repos/${owner}/${repo}/commits/${sha}`);
  if (!res.ok) return res;
  const base = mapCommit(res.data);
  const files = asArray(res.data?.files);
  const patch = files
    .map((f: any) => `--- ${f.filename}\n${f.patch || "(binary or too large)"}`)
    .join("\n\n");
  const { additions, deletions } = commitLineStats(res.data, files);
  return { ok: true, data: { ...base, patch, files: files.length, additions, deletions } };
}

export async function fetchReleases(
  owner: string,
  repo: string,
  limit = 30
): Promise<GitHubResult<GitHubRelease[]>> {
  const res = await ghList<any>(`/repos/${owner}/${repo}/releases`, {
    per_page: Math.min(100, Math.max(1, limit)),
  });
  if (!res.ok) return res;
  return { ok: true, data: res.data.map(mapRelease) };
}

export async function fetchReleaseByTag(
  owner: string,
  repo: string,
  tag: string
): Promise<GitHubResult<GitHubRelease>> {
  const res = await ghGet<any>(`/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`);
  if (!res.ok) return res;
  return { ok: true, data: mapRelease(res.data) };
}

export async function fetchContributors(
  owner: string,
  repo: string,
  limit = 30
): Promise<GitHubResult<Array<GitHubUserSummary & { contributions: number }>>> {
  const res = await ghList<any>(`/repos/${owner}/${repo}/contributors`, {
    per_page: Math.min(100, Math.max(1, limit)),
  });
  if (!res.ok) return res;
  return {
    ok: true,
    data: res.data.map((json) => ({ ...mapUser(json), contributions: json?.contributions ?? 0 })),
  };
}

export async function fetchLanguages(
  owner: string,
  repo: string
): Promise<GitHubResult<Array<{ name: string; bytes: number }>>> {
  const res = await ghGet<Record<string, number>>(`/repos/${owner}/${repo}/languages`);
  if (!res.ok) return { ok: false, error: res.error };
  const entries = Object.entries(res.data || {}).map(([name, bytes]) => ({ name, bytes }));
  entries.sort((a, b) => b.bytes - a.bytes);
  return { ok: true, data: entries };
}

/** README rendered as raw text (markdown source, not HTML). */
export async function fetchReadme(
  owner: string,
  repo: string,
  ref?: string
): Promise<GitHubResult<string>> {
  const res = await ghGetText(`/repos/${owner}/${repo}/readme`, {
    accept: "application/vnd.github.raw",
    params: { ref },
  });
  if (!res.ok) return res;
  return { ok: true, data: res.data || "" };
}

export { truncated };