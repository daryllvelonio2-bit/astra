/**
 * Pure model for the GitHub Collaborators feature: row shape + mapping,
 * formatting and error translation only. Dependency-free so it can be unit-
 * tested with plain node (see /tmp/collab/test-collab.mjs). Nothing here reads
 * the token or the network, and no raw JSON error body ever reaches the UI.
 */

/**
 * What a listed person actually is. This is the discriminator the UI was
 * missing: an accepted collaborator and a pending invitation are removed
 * through two different GitHub endpoints, so a row must know which it is.
 */
export type CollaboratorKind = "accepted" | "pending";

/**
 * One row in the collaborators list. `invitationId` is GitHub's numeric
 * invitation id — it is the only way to cancel a pending invitation, and it
 * cannot be derived from a login, so it must be carried from the API listing
 * all the way into the row.
 */
export interface AccessRow {
  kind: CollaboratorKind;
  login: string;
  avatarUrl: string;
  /** GitHub role key: admin | maintain | write | push | triage | read | pull. */
  permissionKey: string;
  /** Display label, e.g. "Write". */
  permissionLabel: string;
  /** Invitation id for a pending row; null for an accepted collaborator. */
  invitationId: number | null;
}

/** Human-readable label for a GitHub collaborator permission level. */
export function formatPermissionLabel(permission?: string | null): string {
  switch ((permission || "").toLowerCase()) {
    case "admin":
      return "Admin";
    case "maintain":
      return "Maintain";
    case "write":
    case "push":
      return "Write";
    case "triage":
      return "Triage";
    case "read":
    case "pull":
      return "Read";
    case "":
      return "Unknown";
    default:
      return permission ? permission.charAt(0).toUpperCase() + permission.slice(1) : "Unknown";
  }
}

/** Role key from a collaborator/invitation payload (role_name, permissions, or the permissions block). */
export function permissionKeyFor(json: any): string {
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

/** Map one entry of GET /collaborators into a row. */
export function acceptedCollaboratorRow(json: any): AccessRow {
  const key = permissionKeyFor(json);
  return {
    kind: "accepted",
    login: json?.login || "",
    avatarUrl: json?.avatar_url || "",
    permissionKey: key,
    permissionLabel: formatPermissionLabel(key),
    invitationId: null,
  };
}

/**
 * Map one entry of GET /invitations into a row. The invitation id is GitHub's
 * own numeric id (a positive integer); anything else is treated as missing so
 * a row without a usable id is never offered a cancel that cannot work.
 */
export function pendingInvitationRow(json: any): AccessRow {
  const key = permissionKeyFor(json);
  const rawId = json?.id;
  const invitationId =
    typeof rawId === "number" && Number.isInteger(rawId) && rawId > 0 ? rawId : null;
  return {
    kind: "pending",
    login: json?.invitee?.login || "",
    avatarUrl: json?.invitee?.avatar_url || "",
    permissionKey: key,
    permissionLabel: formatPermissionLabel(key),
    invitationId,
  };
}

/** True when the row is a not-yet-accepted invitation. */
export function isPendingRow(row: { kind: CollaboratorKind }): boolean {
  return row.kind === "pending";
}

/** Short human label for the row: its state if pending, else its permission. */
export function accessRowLabel(row: AccessRow): string {
  return row.kind === "pending" ? "Pending invite" : row.permissionLabel;
}

/**
 * True only when the row has a working removal: an accepted collaborator via
 * the collaborators endpoint, or a pending invitation that carries its id (the
 * only way to cancel it). A pending row with no id must not offer removal.
 */
export function canRemoveRow(row: { kind: CollaboratorKind; invitationId: number | null }): boolean {
  if (row.kind === "accepted") return true;
  return row.invitationId !== null && Number.isInteger(row.invitationId) && row.invitationId > 0;
}

/**
 * Short, actionable sentence for a failed GitHub call. 0 means the request
 * never reached GitHub (offline). Never includes the response body or token.
 */
export function humanMessageForStatus(status: number): string {
  switch (status) {
    case 0:
      return "You appear to be offline. Check your connection and try again.";
    case 401:
      return "GitHub rejected the saved token. Sign in again.";
    case 403:
      return "The signed-in account does not have admin rights on this repo, or the token lacks the repo scope.";
    case 404:
      return "Repository not found. Check the owner/repo and your access to it.";
    case 422:
      return "That account does not exist on GitHub, or is already a collaborator.";
    default:
      return `GitHub request failed (HTTP ${status}).`;
  }
}

/**
 * Short sentence for a failed invitation-endpoint call. Same contract as
 * humanMessageForStatus but tuned to DELETE /invitations/{id}: a 404 means the
 * invitation is already gone (or the repo is), and a 403 means not admin / the
 * token lacks the repo scope. Never a raw JSON blob.
 */
export function humanMessageForInvitationStatus(status: number): string {
  switch (status) {
    case 0:
      return "You appear to be offline. Check your connection and try again.";
    case 401:
      return "GitHub rejected the saved token. Sign in again.";
    case 403:
      return "The signed-in account is not an admin on this repo, or the token lacks the repo scope.";
    case 404:
      return "That invitation is already gone, or the repository was not found.";
    case 422:
      return "That invitation cannot be processed. Refresh and try again.";
    default:
      return `GitHub request failed (HTTP ${status}).`;
  }
}

/** "owner/repo" for display, or "" when the ref is missing. */
export function repoFullName(ref: { owner: string; repo: string } | null | undefined): string {
  return ref ? `${ref.owner}/${ref.repo}` : "";
}
