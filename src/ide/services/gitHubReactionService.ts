import { ghDelete, ghList, ghPost, GitHubApiError, GitHubResult } from "./gitHubApi";

/**
 * Emoji reactions on issues, issue comments and pull requests. One module
 * because the three targets share the same {content} payload, the same
 * whitelist and the same list/delete endpoint shape.
 */

/** The exact content values GitHub's reactions API accepts. */
export const REACTION_CONTENTS = ["+1", "-1", "laugh", "confused", "heart", "hooray", "rocket", "eyes"] as const;
export type ReactionContent = (typeof REACTION_CONTENTS)[number];

export type ReactionTarget = "issue" | "comment" | "pull";

/** One reaction row (from a list or a create response). */
export interface GitHubReaction {
  id: number;
  user: string;
  userAvatar: string;
  content: string;
  createdAt: string;
}

function fail(message: string): { ok: false; error: GitHubApiError } {
  return { ok: false, error: { status: 0, rateLimited: false, scopeMissing: false, message } };
}

function isReactionTarget(target: string): target is ReactionTarget {
  return target === "issue" || target === "comment" || target === "pull";
}

function reactionPath(target: ReactionTarget, owner: string, repo: string, id: number | string): string {
  const o = encodeURIComponent(owner);
  const r = encodeURIComponent(repo);
  if (target === "issue") return `/repos/${o}/${r}/issues/${id}/reactions`;
  if (target === "comment") return `/repos/${o}/${r}/issues/comments/${id}/reactions`;
  return `/repos/${o}/${r}/pulls/${id}/reactions`;
}

function mapReaction(json: any): GitHubReaction {
  return {
    id: json?.id ?? 0,
    user: json?.user?.login || "",
    userAvatar: json?.user?.avatar_url || "",
    content: json?.content || "",
    createdAt: json?.created_at || "",
  };
}

/** List the reactions on an issue, comment or pull request. */
export async function fetchReactions(
  target: ReactionTarget | string,
  owner: string,
  repo: string,
  id: number | string
): Promise<GitHubResult<GitHubReaction[]>> {
  if (!isReactionTarget(target)) return fail(`Invalid reaction target "${target}". Use issue, comment or pull.`);
  const res = await ghList<any>(reactionPath(target, owner, repo, id), { per_page: 100 });
  if (!res.ok) return res;
  return { ok: true, data: res.data.map(mapReaction) };
}

/**
 * Add a reaction. The content value is validated against GitHub's whitelist
 * before the call so an unsupported emoji never reaches the network.
 */
export async function addReaction(
  target: ReactionTarget | string,
  owner: string,
  repo: string,
  id: number | string,
  content: ReactionContent | string
): Promise<GitHubResult<GitHubReaction>> {
  if (!isReactionTarget(target)) return fail(`Invalid reaction target "${target}". Use issue, comment or pull.`);
  if (!(REACTION_CONTENTS as readonly string[]).includes(content)) {
    return fail(`Unsupported reaction "${content}". Use one of: ${REACTION_CONTENTS.join(", ")}.`);
  }
  const res = await ghPost<any>(reactionPath(target, owner, repo, id), { content });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: mapReaction(res.data) };
}

/** Remove one of the signed-in user's reactions by its reaction id. */
export async function removeReaction(
  target: ReactionTarget | string,
  owner: string,
  repo: string,
  id: number | string,
  contentId: number
): Promise<GitHubResult<unknown>> {
  if (!isReactionTarget(target)) return fail(`Invalid reaction target "${target}". Use issue, comment or pull.`);
  return ghDelete(`${reactionPath(target, owner, repo, id)}/${contentId}`);
}
