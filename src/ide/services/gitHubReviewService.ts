import { ghList, ghPost, ghPut, GitHubApiError, GitHubResult } from "./gitHubApi";
import { GitHubPullReview } from "./gitHubTypes";

/**
 * Pull request review writes and their inline (diff-anchored) comments —
 * the same surface github.com's review box exposes: submit a review
 * (approve / request changes / comment), dismiss one, read the inline
 * threads and reply to a single comment. Kept separate from
 * gitHubPullService so the read/list path stays pure.
 */

/** Events accepted by POST /repos/{o}/{r}/pulls/{n}/reviews. */
export const REVIEW_EVENTS = ["APPROVE", "REQUEST_CHANGES", "COMMENT"] as const;
export type PullReviewEvent = (typeof REVIEW_EVENTS)[number];

/** One diff-anchored comment in a review's `comments` array. */
export interface PullReviewCommentInput {
  path: string;
  /** End line of the commented range (anchored on `side`). */
  line?: number;
  /** "LEFT" (old) | "RIGHT" (new). Defaults to RIGHT when omitted. */
  side?: "LEFT" | "RIGHT";
  /** First line of a multi-line range (anchored on `startSide`). */
  startLine?: number;
  startSide?: "LEFT" | "RIGHT";
  /** Per-comment body; a review-level body rides on the payload itself. */
  body?: string;
}

/** One inline review comment row from GET /repos/{o}/{r}/pulls/{n}/comments. */
export interface GitHubInlineReviewComment {
  id: number;
  path: string;
  /** Line the comment anchors to; null when GitHub cannot anchor it. */
  line: number | null;
  /** "LEFT" | "RIGHT" — which side of the diff the line sits on. */
  side: string;
  body: string;
  user: string;
  /** Parent comment id when this row is a reply inside a thread. */
  inReplyToId: number | null;
  createdAt: string;
  htmlUrl: string;
}

function fail(message: string): { ok: false; error: GitHubApiError } {
  return { ok: false, error: { status: 0, rateLimited: false, scopeMissing: false, message } };
}

function mapInlineComment(json: any): GitHubInlineReviewComment {
  return {
    id: json?.id ?? 0,
    path: json?.path || "",
    line: typeof json?.line === "number" ? json.line : null,
    side: json?.side || "",
    body: json?.body || "",
    user: json?.user?.login || "",
    inReplyToId: typeof json?.in_reply_to_id === "number" ? json.in_reply_to_id : null,
    createdAt: json?.created_at || "",
    htmlUrl: json?.html_url || "",
  };
}

function mapReview(json: any, fallbackId = 0): GitHubPullReview {
  return {
    id: json?.id ?? fallbackId,
    authorLogin: json?.user?.login || "",
    authorAvatar: json?.user?.avatar_url || "",
    state: json?.state || "COMMENTED",
    body: json?.body || "",
    submittedAt: json?.submitted_at || "",
  };
}

/**
 * Submit a review (approve / request changes / comment). The event is
 * validated before the call so an invalid value never reaches the network.
 */
export async function submitPullReview(
  owner: string,
  repo: string,
  number: number,
  payload: { event: PullReviewEvent | string; body?: string; comments?: PullReviewCommentInput[] }
): Promise<GitHubResult<GitHubPullReview>> {
  if (!(REVIEW_EVENTS as readonly string[]).includes(payload.event)) {
    return fail(`Invalid review event "${payload.event}". Use APPROVE, REQUEST_CHANGES or COMMENT.`);
  }
  const comments = (payload.comments || [])
    .filter((c) => !!c?.path)
    .map((c) => ({
      path: c.path,
      ...(c.line !== undefined ? { line: c.line } : {}),
      ...(c.side ? { side: c.side } : {}),
      ...(c.startLine !== undefined ? { start_line: c.startLine } : {}),
      ...(c.startSide ? { start_side: c.startSide } : {}),
      ...(c.body ? { body: c.body } : {}),
    }));
  const res = await ghPost<any>(`/repos/${owner}/${repo}/pulls/${number}/reviews`, {
    event: payload.event,
    body: payload.body || "",
    ...(comments.length ? { comments } : {}),
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: mapReview(res.data) };
}

/**
 * Dismiss a submitted review. GitHub's dismissals endpoint is PUT-only and
 * requires a message; a neutral one is sent when the caller has no reason.
 */
export async function dismissPullReview(
  owner: string,
  repo: string,
  number: number,
  reviewId: number,
  message?: string
): Promise<GitHubResult<GitHubPullReview>> {
  const res = await ghPut<any>(`/repos/${owner}/${repo}/pulls/${number}/reviews/${reviewId}/dismissals`, {
    message: message || "Review dismissed.",
    event: "DISMISS",
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: mapReview(res.data, reviewId) };
}

/** Inline (diff-anchored) review comments — the whole thread for a PR. */
export async function fetchInlineReviewComments(
  owner: string,
  repo: string,
  number: number
): Promise<GitHubResult<GitHubInlineReviewComment[]>> {
  const res = await ghList<any>(`/repos/${owner}/${repo}/pulls/${number}/comments`, { per_page: 100 });
  if (!res.ok) return res;
  return { ok: true, data: res.data.map(mapInlineComment) };
}

/** Reply to one inline review comment (appends to its thread). */
export async function replyToReviewComment(
  owner: string,
  repo: string,
  number: number,
  commentId: number,
  body: string
): Promise<GitHubResult<GitHubInlineReviewComment>> {
  const res = await ghPost<any>(`/repos/${owner}/${repo}/pulls/${number}/comments/${commentId}/replies`, { body });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: mapInlineComment(res.data) };
}
