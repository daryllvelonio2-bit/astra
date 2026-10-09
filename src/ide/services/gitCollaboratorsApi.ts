import { getGitHubToken } from "./gitHubApi";
import {
  acceptedCollaboratorRow,
  humanMessageForInvitationStatus,
  humanMessageForStatus,
  pendingInvitationRow,
  type AccessRow,
} from "./gitCollaboratorModel";
import {
  canManageVisibility,
  humanMessageForVisibilityStatus,
  isRepoPrivate,
} from "./gitRepoVisibilityModel";

/**
 * GitHub collaborators API for the active repo.
 *
 * Uses the same token plumbing as the rest of the app (getGitHubToken, the
 * memoized accessor in gitHubApi) and the same GitHub REST conventions
 * (Bearer auth, `application/vnd.github+json`, API version 2022-11-28). Every
 * failure is translated into one short sentence via humanMessageForStatus —
 * a raw JSON error body never leaves this module, and the token is never
 * logged or returned to callers.
 *
 * The owner/repo parser is reused from gitRemoteRef (re-exported below) rather
 * than re-implemented here.
 */

export { parseGitHubRepo as parseRepoFullName } from "./gitRemoteRef";
export type { GitHubRepoRef } from "./gitRemoteRef";

const API_BASE = "https://api.github.com";
const API_VERSION = "2022-11-28";

/**
 * One list row: an accepted collaborator or a pending invitation. The shape
 * (and the kind discriminator + invitation id it needs) is owned by the pure
 * model so it is unit-testable without the network.
 */
export type CollaboratorRow = AccessRow;

export interface AccessResult {
  ok: boolean;
  error?: string;
  collaborators: CollaboratorRow[];
  invitations: CollaboratorRow[];
}

export interface MutationResult {
  ok: boolean;
  /** HTTP status; -1 when input was rejected before the call. */
  status: number;
  error?: string;
}

/** Current visibility of the active repo plus what the account may do about it. */
export interface RepoVisibilityInfo {
  /** True when the repo is not public (private or enterprise-internal). */
  isPrivate: boolean;
  /** Raw GitHub visibility when the API reported one: public | private | internal. */
  visibility: string;
  /** True when the signed-in account is an admin/owner (permissions.admin). */
  canManage: boolean;
}

export interface VisibilityResult {
  ok: boolean;
  data?: RepoVisibilityInfo;
  error?: string;
}

interface HttpResult {
  status: number;
  ok: boolean;
  json: any;
}

function ownerRepoPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

async function ghRequest(method: string, path: string, body?: unknown): Promise<HttpResult> {
  const token = await getGitHubToken();
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": API_VERSION,
    "User-Agent": "astra-mobile-ide",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await response.text().catch(() => "");
    let json: any = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch (_) {
        json = null; // non-JSON error body: keep it out of the UI
      }
    }
    return { status: response.status, ok: response.ok, json };
  } catch (_) {
    // No response at all — offline / DNS / TLS.
    return { status: 0, ok: false, json: null };
  }
}

/** People with direct access to the repo. */
export async function listCollaborators(
  owner: string,
  repo: string
): Promise<{ ok: boolean; data: CollaboratorRow[]; error?: string }> {
  const res = await ghRequest(
    "GET",
    `${ownerRepoPath(owner, repo)}/collaborators?affiliation=direct&per_page=100`
  );
  if (!res.ok) return { ok: false, data: [], error: humanMessageForStatus(res.status) };
  const list = Array.isArray(res.json) ? res.json : [];
  return { ok: true, data: list.map(acceptedCollaboratorRow) };
}

/** Pending invitations that have not been accepted yet. */
export async function listInvitations(
  owner: string,
  repo: string
): Promise<{ ok: boolean; data: CollaboratorRow[]; error?: string }> {
  const res = await ghRequest("GET", `${ownerRepoPath(owner, repo)}/invitations`);
  if (!res.ok) return { ok: false, data: [], error: humanMessageForStatus(res.status) };
  const list = Array.isArray(res.json) ? res.json : [];
  return { ok: true, data: list.map(pendingInvitationRow) };
}

/**
 * Collaborators plus pending invitations in one payload. A failure listing
 * collaborators is fatal; the invitations call is supplementary (it is only
 * visible to admins) so its failure never blanks the list.
 */
export async function listRepoAccess(owner: string, repo: string): Promise<AccessResult> {
  const collaborators = await listCollaborators(owner, repo);
  if (!collaborators.ok) {
    return { ok: false, error: collaborators.error, collaborators: [], invitations: [] };
  }
  const invitations = await listInvitations(owner, repo);
  return {
    ok: true,
    collaborators: collaborators.data,
    invitations: invitations.ok ? invitations.data : [],
  };
}

/**
 * Invite a user (permission: push). GitHub answers 201 when an invitation is
 * created and 204 when the user is already a collaborator (or the permission
 * was updated) — both are success.
 */
export async function addCollaborator(
  owner: string,
  repo: string,
  username: string
): Promise<MutationResult & { invited: boolean }> {
  const user = (username || "").trim().replace(/^@/, "");
  if (!user) return { ok: false, status: -1, error: "Enter a GitHub username.", invited: false };
  const res = await ghRequest("PUT", `${ownerRepoPath(owner, repo)}/collaborators/${encodeURIComponent(user)}`, {
    permission: "push",
  });
  if (res.ok) return { ok: true, status: res.status, invited: res.status === 201 };
  return { ok: false, status: res.status, error: humanMessageForStatus(res.status), invited: false };
}

/**
 * Remove an ACCEPTED collaborator's access. Success is 204. Only valid for a
 * user who already accepted — a pending invitee is not a collaborator yet, so
 * this endpoint does not act on them; cancel an invitation with
 * cancelInvitation below instead.
 */
export async function removeCollaborator(owner: string, repo: string, username: string): Promise<MutationResult> {
  const user = (username || "").trim().replace(/^@/, "");
  if (!user) return { ok: false, status: -1, error: "Missing username." };
  const res = await ghRequest("DELETE", `${ownerRepoPath(owner, repo)}/collaborators/${encodeURIComponent(user)}`);
  if (res.ok) return { ok: true, status: res.status };
  return { ok: false, status: res.status, error: humanMessageForStatus(res.status) };
}

/**
 * Cancel a PENDING invitation. Success is 204. Takes the invitation's own
 * numeric id (from listInvitations) — a login cannot identify an invitation,
 * so the id is what the row must carry. A failure is one human sentence for
 * the invitations endpoint; a raw JSON error body never leaves this module.
 */
export async function cancelInvitation(
  owner: string,
  repo: string,
  invitationId: number
): Promise<MutationResult> {
  if (!Number.isInteger(invitationId) || invitationId <= 0) {
    return { ok: false, status: -1, error: "This invitation has no id, so it cannot be cancelled." };
  }
  const res = await ghRequest("DELETE", `${ownerRepoPath(owner, repo)}/invitations/${invitationId}`);
  if (res.ok) return { ok: true, status: res.status };
  return { ok: false, status: res.status, error: humanMessageForInvitationStatus(res.status) };
}

/**
 * Read the repo's current visibility plus whether the signed-in account may
 * change it. GET /repos/{owner}/{repo} returns `private`, `visibility`, and a
 * `permissions` block — the source of truth for the modal's control.
 */
export async function getRepoVisibility(owner: string, repo: string): Promise<VisibilityResult> {
  const res = await ghRequest("GET", ownerRepoPath(owner, repo));
  if (!res.ok) return { ok: false, error: humanMessageForVisibilityStatus(res.status) };
  const isPrivate = isRepoPrivate(res.json);
  return {
    ok: true,
    data: {
      isPrivate,
      visibility: typeof res.json?.visibility === "string" && res.json.visibility
        ? res.json.visibility
        : isPrivate
        ? "private"
        : "public",
      canManage: canManageVisibility(res.json),
    },
  };
}

/**
 * Change the repo's visibility. PATCH /repos/{owner}/{repo} with
 * `{"private": true|false}`. Success is 200; any failure is translated to one
 * human sentence — a raw JSON error body never leaves this module. Callers must
 * re-read the state with getRepoVisibility afterwards rather than assuming the
 * change took effect.
 */
export async function setRepoVisibility(
  owner: string,
  repo: string,
  makePrivate: boolean
): Promise<MutationResult> {
  const res = await ghRequest("PATCH", ownerRepoPath(owner, repo), { private: makePrivate });
  if (res.ok) return { ok: true, status: res.status };
  return { ok: false, status: res.status, error: humanMessageForVisibilityStatus(res.status) };
}
