import { ghGet, ghList, ghPatch, ghPost, ghPut, GitHubResult } from "./gitHubApi";
import { GitHubLabel, GitHubPull, GitHubPullFile, GitHubPullReview } from "./gitHubTypes";

/**
 * Pull requests with the full review workflow: list/filter, files + patch,
 * reviews, review requests, comments, create, merge, close, reopen, ready
 * for review, update branch. Mirrors github.com's PR page actions.
 */

export interface PullListOptions {
  state?: "open" | "closed" | "all";
  /** "created" | "updated" | "popularity" | "long-running" */
  sort?: "created" | "updated" | "popularity" | "long-running";
  base?: string;
  head?: string;
  limit?: number;
  /** Only PRs the signed-in user authored (the "Created by me" scope). */
  mineOnly?: boolean;
  /** Only PRs requesting the signed-in user's review. */
  reviewRequested?: boolean;
  login?: string;
}

function mapLabel(json: any): GitHubLabel {
  return {
    name: json?.name || "",
    color: json?.color || "888888",
    description: (json?.description || "").trim(),
  };
}

export function mapPull(json: any, repoFullName = ""): GitHubPull {
  return {
    number: json?.number ?? 0,
    title: json?.title || "",
    body: json?.body || "",
    state: json?.state || "open",
    isDraft: !!json?.draft,
    isMerged: !!json?.merged,
    mergeable: json?.mergeable === null || json?.mergeable === undefined ? "" : String(json.mergeable),
    mergedByLogin: json?.merged_by?.login || "",
    authorLogin: json?.user?.login || "",
    authorAvatar: json?.user?.avatar_url || "",
    labels: Array.isArray(json?.labels) ? json.labels.map(mapLabel) : [],
    baseRef: json?.base?.ref || "",
    headRef: json?.head?.ref || "",
    requestedReviewers: [
      ...(Array.isArray(json?.requested_reviewers) ? json.requested_reviewers.map((r: any) => r?.login) : []),
      ...(Array.isArray(json?.requested_teams) ? json.requested_teams.map((t: any) => `team:${t?.slug}`) : []),
    ].filter(Boolean),
    comments: json?.comments ?? 0,
    reviewComments: json?.review_comments ?? 0,
    commits: json?.commits ?? 0,
    additions: json?.additions ?? 0,
    deletions: json?.deletions ?? 0,
    changedFiles: json?.changed_files ?? 0,
    createdAt: json?.created_at || "",
    updatedAt: json?.updated_at || "",
    mergedAt: json?.merged_at || "",
    htmlUrl: json?.html_url || "",
    repoFullName,
  };
}

export async function fetchPulls(
  owner: string,
  repo: string,
  options?: PullListOptions
): Promise<GitHubResult<GitHubPull[]>> {
  const state = options?.state || "open";

  if (options?.reviewRequested && options.login) {
    const res = await ghGet<{ items?: any[] }>("/search/issues", {
      params: {
        q: `repo:${owner}/${repo} is:pr is:open review-requested:${options.login}`,
        per_page: Math.min(100, Math.max(1, options.limit ?? 40)),
      },
    });
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, data: (res.data?.items || []).map((j) => mapPull(j, `${owner}/${repo}`)) };
  }

  const res = await ghList<any>(`/repos/${owner}/${repo}/pulls`, {
    state,
    sort: options?.sort || "updated",
    direction: "desc",
    base: options?.base,
    head: options?.head,
    per_page: Math.min(100, Math.max(1, options?.limit ?? 40)),
  });
  if (!res.ok) return res;
  let pulls = res.data.map((j) => mapPull(j, `${owner}/${repo}`));
  if (options?.mineOnly && options.login) {
    pulls = pulls.filter((p) => p.authorLogin === options.login);
  }
  return { ok: true, data: pulls };
}

export async function fetchPull(
  owner: string,
  repo: string,
  number: number
): Promise<GitHubResult<GitHubPull>> {
  const res = await ghGet<any>(`/repos/${owner}/${repo}/pulls/${number}`);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: mapPull(res.data, `${owner}/${repo}`) };
}

export async function fetchPullFiles(
  owner: string,
  repo: string,
  number: number
): Promise<GitHubResult<GitHubPullFile[]>> {
  const res = await ghList<any>(`/repos/${owner}/${repo}/pulls/${number}/files`, { per_page: 100 });
  if (!res.ok) return res;
  return {
    ok: true,
    data: res.data.map((json) => ({
      filename: json?.filename || "",
      status: json?.status || "modified",
      additions: json?.additions ?? 0,
      deletions: json?.deletions ?? 0,
      changes: json?.changes ?? 0,
      patch: json?.patch || "",
    })),
  };
}

export async function fetchPullReviews(
  owner: string,
  repo: string,
  number: number
): Promise<GitHubResult<GitHubPullReview[]>> {
  const res = await ghList<any>(`/repos/${owner}/${repo}/pulls/${number}/reviews`, { per_page: 100 });
  if (!res.ok) return res;
  return {
    ok: true,
    data: res.data.map((json) => ({
      id: json?.id ?? 0,
      authorLogin: json?.user?.login || "",
      authorAvatar: json?.user?.avatar_url || "",
      state: json?.state || "COMMENTED",
      body: json?.body || "",
      submittedAt: json?.submitted_at || "",
    })),
  };
}

export async function createPull(
  owner: string,
  repo: string,
  payload: { title: string; head: string; base: string; body?: string; draft?: boolean }
): Promise<GitHubResult<GitHubPull>> {
  const res = await ghPost<any>(`/repos/${owner}/${repo}/pulls`, {
    title: payload.title,
    head: payload.head,
    base: payload.base,
    body: payload.body || "",
    draft: !!payload.draft,
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: mapPull(res.data, `${owner}/${repo}`) };
}

export async function mergePull(
  owner: string,
  repo: string,
  number: number,
  options?: { method?: "merge" | "squash" | "rebase"; title?: string; message?: string }
): Promise<GitHubResult<{ merged: boolean; message: string }>> {
  const res = await ghPut<any>(`/repos/${owner}/${repo}/pulls/${number}/merge`, {
    merge_method: options?.method || "merge",
    ...(options?.title ? { commit_title: options.title } : {}),
    ...(options?.message ? { commit_message: options.message } : {}),
  });
  if (!res.ok) return { ok: false, error: res.error };
  return {
    ok: true,
    data: { merged: !!res.data?.merged, message: res.data?.message || "Pull request merged" },
  };
}

export async function closePull(
  owner: string,
  repo: string,
  number: number
): Promise<GitHubResult<GitHubPull>> {
  return patchPull(owner, repo, number, { state: "closed" });
}

export async function reopenPull(
  owner: string,
  repo: string,
  number: number
): Promise<GitHubResult<GitHubPull>> {
  return patchPull(owner, repo, number, { state: "open" });
}

async function patchPull(
  owner: string,
  repo: string,
  number: number,
  patch: Record<string, unknown>
): Promise<GitHubResult<GitHubPull>> {
  const res = await ghPatch<any>(`/repos/${owner}/${repo}/pulls/${number}`, patch);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: mapPull(res.data, `${owner}/${repo}`) };
}

/** Toggle draft state (ready for review / convert back to draft). */
export async function setPullReady(
  owner: string,
  repo: string,
  number: number,
  ready = true
): Promise<GitHubResult<GitHubPull>> {
  return patchPull(owner, repo, number, { draft: !ready });
}

/** Merge the base branch into the PR branch, as the "Update branch" button does. */
export async function updatePullBranch(
  owner: string,
  repo: string,
  number: number
): Promise<GitHubResult<unknown>> {
  return ghPut(`/repos/${owner}/${repo}/pulls/${number}/update-branch`, {});
}

export async function requestReviewers(
  owner: string,
  repo: string,
  number: number,
  reviewers: string[],
  teamReviewers: string[] = []
): Promise<GitHubResult<unknown>> {
  return ghPost(`/repos/${owner}/${repo}/pulls/${number}/requested_reviewers`, {
    ...(reviewers.length ? { reviewers } : {}),
    ...(teamReviewers.length ? { team_reviewers: teamReviewers } : {}),
  });
}