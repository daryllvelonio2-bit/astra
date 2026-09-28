import { ghDelete, ghGet, ghList, ghPatch, ghPost, ghPut, GitHubResult } from "./gitHubApi";
import { GitHubComment } from "./gitHubTypes";

/**
 * Gist writes and their comments — the same surface github.com's gist page
 * exposes: create, edit, delete, star, unstar, fork, read + write comments.
 * Kept separate from gitHubAccountService so its read/list paths stay pure.
 */

/** Files payload for create/update: filename -> content. */
export type GistFiles = Record<string, string>;

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

/** Create a gist (one or more files; `public: false` = secret gist). */
export async function createGist(
  files: GistFiles,
  description?: string,
  isPublic = false
): Promise<GitHubResult<{ id: string; htmlUrl: string }>> {
  const payload: Record<string, unknown> = {
    files: Object.fromEntries(
      Object.entries(files || {}).map(([name, content]) => [name, { content }])
    ),
  };
  if (description) payload.description = description;
  payload.public = !!isPublic;
  const res = await ghPost<any>("/gists", payload);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: { id: String(res.data?.id ?? ""), htmlUrl: res.data?.html_url || "" } };
}

/**
 * Edit a gist: update/add/remove files (a null content value deletes the
 * file) and optionally rewrite the description. GitHub's PATCH accepts
 * either field alone, so both are optional here.
 */
export async function updateGist(
  id: string | number,
  files?: GistFiles,
  description?: string
): Promise<GitHubResult<unknown>> {
  const patch: Record<string, unknown> = {};
  if (files) {
    patch.files = Object.fromEntries(
      Object.entries(files).map(([name, content]) => [name, { content }])
    );
  }
  if (description !== undefined) patch.description = description;
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: { status: 0, rateLimited: false, scopeMissing: false, message: "Nothing to update — pass files or a description." } };
  }
  const res = await ghPatch<any>(`/gists/${id}`, patch);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: res.data };
}

/** Delete a gist permanently (no undo — the UI should confirm first). */
export async function deleteGist(id: string | number): Promise<GitHubResult<unknown>> {
  return ghDelete(`/gists/${id}`);
}

/** Star a gist (idempotent on GitHub's side). */
export function starGist(id: string | number): Promise<GitHubResult<unknown>> {
  return ghPut(`/gists/${id}/star`);
}

/** Unstar a gist. */
export function unstarGist(id: string | number): Promise<GitHubResult<unknown>> {
  return ghDelete(`/gists/${id}/star`);
}

/** Fork a gist; the response is the new fork. */
export async function forkGist(id: string | number): Promise<GitHubResult<{ id: string; htmlUrl: string }>> {
  const res = await ghPost<any>(`/gists/${id}/forks`);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: { id: String(res.data?.id ?? ""), htmlUrl: res.data?.html_url || "" } };
}

/** Comments on a gist, oldest first. */
export async function fetchGistComments(id: string | number): Promise<GitHubResult<GitHubComment[]>> {
  const res = await ghGet<any[]>(`/gists/${id}/comments`);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: (Array.isArray(res.data) ? res.data : []).map(mapComment) };
}

/** Add a comment to a gist. */
export async function addGistComment(id: string | number, body: string): Promise<GitHubResult<GitHubComment>> {
  const res = await ghPost<any>(`/gists/${id}/comments`, { body });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: mapComment(res.data) };
}
