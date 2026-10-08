import { getGitHubToken } from "./gitHubApi";
import { formatPermissionLabel, humanMessageForStatus } from "./gitCollaboratorModel";

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

export interface CollaboratorRow {
  login: string;
  avatarUrl: string;
  /** GitHub role key: admin | maintain | write | push | triage | read | pull. */
  permissionKey: string;
  /** Display label, e.g. "Write". */
  permissionLabel: string;
  /** True for a pending (not yet accepted) invitation. */
  isPending: boolean;
  invitationId: number | null;
}

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

function permissionKeyFor(json: any): string {
  if (typeof json?.role_name === "string" && json.role_name) return json.role_name;
  if (typeof json?.permissions === "string" && json.permissions) return json.permissions;
  const p = json?.permissions || {};
  if (p.admin) return "admin";
  if (p.maintain) return "maintain";
  if (p.push) return "write";
  if (p.triage) return "triage";
  if (p.pull) return "read";
  return "read";
}

function mapCollaborator(json: any): CollaboratorRow {
  const key = permissionKeyFor(json);
  return {
    login: json?.login || "",
    avatarUrl: json?.avatar_url || "",
    permissionKey: key,
    permissionLabel: formatPermissionLabel(key),
    isPending: false,
    invitationId: null,
  };
}

function mapInvitation(json: any): CollaboratorRow {
  const key = permissionKeyFor(json);
  return {
    login: json?.invitee?.login || "",
    avatarUrl: json?.invitee?.avatar_url || "",
    permissionKey: key,
    permissionLabel: formatPermissionLabel(key),
    isPending: true,
    invitationId: typeof json?.id === "number" ? json.id : null,
  };
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
  return { ok: true, data: list.map(mapCollaborator) };
}

/** Pending invitations that have not been accepted yet. */
export async function listInvitations(
  owner: string,
  repo: string
): Promise<{ ok: boolean; data: CollaboratorRow[]; error?: string }> {
  const res = await ghRequest("GET", `${ownerRepoPath(owner, repo)}/invitations`);
  if (!res.ok) return { ok: false, data: [], error: humanMessageForStatus(res.status) };
  const list = Array.isArray(res.json) ? res.json : [];
  return { ok: true, data: list.map(mapInvitation) };
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
 * Remove a collaborator's access. Success is 204. The same call is used for a
 * pending-invite row (the collaborators endpoint is the one this feature
 * defines); if GitHub rejects it for a not-yet-accepted invite, the mapped
 * human error is shown — cancelling an invitation has its own endpoint and is
 * outside this feature's scope.
 */
export async function removeCollaborator(owner: string, repo: string, username: string): Promise<MutationResult> {
  const user = (username || "").trim().replace(/^@/, "");
  if (!user) return { ok: false, status: -1, error: "Missing username." };
  const res = await ghRequest("DELETE", `${ownerRepoPath(owner, repo)}/collaborators/${encodeURIComponent(user)}`);
  if (res.ok) return { ok: true, status: res.status };
  return { ok: false, status: res.status, error: humanMessageForStatus(res.status) };
}
