import { ghDelete, ghGet, ghList, ghPatch, ghPost, ghPut, GitHubResult } from "./gitHubApi";
import { GitHubComment, GitHubIssue, GitHubLabel } from "./gitHubTypes";

/**
 * Issues, PRs and their comments — the same surface github.com exposes:
 * list/filter, open, comment, edit, label, assign, milestone, close,
 * reopen, lock. PRs are issues in the REST API, so listing reuses the
 * issues endpoint with the `isPullRequest` flag preserved.
 */

export interface IssueListOptions {
  /** "open" | "closed" | "all" */
  state?: "open" | "closed" | "all";
  labels?: string[];
  assignee?: string;
  milestone?: string;
  /** "created" | "updated" | "comments" */
  sort?: "created" | "updated" | "comments";
  direction?: "asc" | "desc";
  limit?: number;
  /** Query string, e.g. "auth token" — searches title/body. */
  query?: string;
  /** Filter by creator login (used by the "Created by me" scope). */
  creator?: string;
}

function mapLabel(json: any): GitHubLabel {
  return {
    name: json?.name || "",
    color: json?.color || "888888",
    description: (json?.description || "").trim(),
  };
}

export function mapIssue(json: any, repoFullName = ""): GitHubIssue {
  return {
    number: json?.number ?? 0,
    title: json?.title || "",
    body: json?.body || "",
    state: json?.state || "open",
    stateReason: json?.state_reason || "",
    isPullRequest: !!json?.pull_request,
    authorLogin: json?.user?.login || "",
    authorAvatar: json?.user?.avatar_url || "",
    labels: Array.isArray(json?.labels) ? json.labels.map(mapLabel) : [],
    assigneeLogins: Array.isArray(json?.assignees)
      ? json.assignees.map((a: any) => a?.login).filter(Boolean)
      : [],
    milestone: json?.milestone?.title || "",
    commentCount: json?.comments ?? 0,
    createdAt: json?.created_at || "",
    updatedAt: json?.updated_at || "",
    closedAt: json?.closed_at || "",
    htmlUrl: json?.html_url || "",
    repoFullName: repoFullName || json?.repository_url?.replace("https://api.github.com/repos/", "") || "",
  };
}

/** List issues/PRs, optionally filtered the way the web UI does. */
export async function fetchIssues(
  owner: string,
  repo: string,
  options?: IssueListOptions
): Promise<GitHubResult<GitHubIssue[]>> {
  const query = (options?.query || "").trim();
  if (query) {
    const parts = [`repo:${owner}/${repo}`, query];
    if (options?.state && options.state !== "all") parts.push(`is:${options.state}`);
    if (options?.assignee) parts.push(`assignee:${options.assignee}`);
    if (options?.creator) parts.push(`author:${options.creator}`);
    if (options?.labels?.length) parts.push(...options.labels.map((l) => `label:"${l}"`));
    const res = await ghGet<{ items?: any[] }>("/search/issues", {
      params: { q: parts.join(" "), per_page: Math.min(100, Math.max(1, options?.limit ?? 40)) },
    });
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, data: (res.data?.items || []).map((j) => mapIssue(j, `${owner}/${repo}`)) };
  }

  const res = await ghList<any>(`/repos/${owner}/${repo}/issues`, {
    state: options?.state || "open",
    labels: options?.labels?.length ? options.labels.join(",") : undefined,
    assignee: options?.assignee,
    milestone: options?.milestone,
    creator: options?.creator,
    sort: options?.sort || "updated",
    direction: options?.direction || "desc",
    per_page: Math.min(100, Math.max(1, options?.limit ?? 40)),
  });
  if (!res.ok) return res;
  return { ok: true, data: res.data.map((j) => mapIssue(j, `${owner}/${repo}`)) };
}

/** One issue or PR (numbers are shared between the two namespaces). */
export async function fetchIssue(
  owner: string,
  repo: string,
  number: number
): Promise<GitHubResult<GitHubIssue>> {
  const res = await ghGet<any>(`/repos/${owner}/${repo}/issues/${number}`);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: mapIssue(res.data, `${owner}/${repo}`) };
}

function mapComment(json: any): GitHubComment {
  return {
    id: json?.id ?? 0,
    body: json?.body || "",
    authorLogin: json?.user?.login || "",
    authorAvatar: json?.user?.avatar_url || "",
    authorAssociation: json?.author_association || "",
    createdAt: json?.created_at || "",
    updatedAt: json?.updated_at || "",
    htmlUrl: json?.html_url || "",
  };
}

export async function fetchIssueComments(
  owner: string,
  repo: string,
  number: number,
  limit = 100
): Promise<GitHubResult<GitHubComment[]>> {
  const res = await ghList<any>(`/repos/${owner}/${repo}/issues/${number}/comments`, {
    per_page: Math.min(100, Math.max(1, limit)),
  });
  if (!res.ok) return res;
  return { ok: true, data: res.data.map(mapComment) };
}

export async function createIssue(
  owner: string,
  repo: string,
  payload: { title: string; body?: string; labels?: string[]; assignees?: string[]; milestone?: number }
): Promise<GitHubResult<GitHubIssue>> {
  const res = await ghPost<any>(`/repos/${owner}/${repo}/issues`, {
    title: payload.title,
    body: payload.body || "",
    ...(payload.labels?.length ? { labels: payload.labels } : {}),
    ...(payload.assignees?.length ? { assignees: payload.assignees } : {}),
    ...(payload.milestone ? { milestone: payload.milestone } : {}),
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: mapIssue(res.data, `${owner}/${repo}`) };
}

export async function updateIssue(
  owner: string,
  repo: string,
  number: number,
  patch: { title?: string; body?: string; state?: "open" | "closed"; state_reason?: string; labels?: string[]; assignees?: string[]; milestone?: number | null }
): Promise<GitHubResult<GitHubIssue>> {
  const res = await ghPatch<any>(`/repos/${owner}/${repo}/issues/${number}`, patch);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: mapIssue(res.data, `${owner}/${repo}`) };
}

export function closeIssue(
  owner: string,
  repo: string,
  number: number,
  reason: "completed" | "not_planned" = "completed"
): Promise<GitHubResult<GitHubIssue>> {
  return updateIssue(owner, repo, number, { state: "closed", state_reason: reason });
}

export function reopenIssue(
  owner: string,
  repo: string,
  number: number
): Promise<GitHubResult<GitHubIssue>> {
  return updateIssue(owner, repo, number, { state: "open" });
}

export async function addIssueComment(
  owner: string,
  repo: string,
  number: number,
  body: string
): Promise<GitHubResult<GitHubComment>> {
  const res = await ghPost<any>(`/repos/${owner}/${repo}/issues/${number}/comments`, { body });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: mapComment(res.data) };
}

export async function updateComment(
  owner: string,
  repo: string,
  commentId: number,
  body: string
): Promise<GitHubResult<GitHubComment>> {
  const res = await ghPatch<any>(`/repos/${owner}/${repo}/issues/comments/${commentId}`, { body });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: mapComment(res.data) };
}

export async function lockIssue(
  owner: string,
  repo: string,
  number: number,
  lock: boolean,
  reason: "off-topic" | "too heated" | "resolved" | "spam" = "resolved"
): Promise<GitHubResult<unknown>> {
  if (lock) return ghPut(`/repos/${owner}/${repo}/issues/${number}/lock`, { lock_reason: reason });
  return ghDelete(`/repos/${owner}/${repo}/issues/${number}/lock`);
}