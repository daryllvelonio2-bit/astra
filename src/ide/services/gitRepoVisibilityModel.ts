/**
 * Pure model for the GitHub repository visibility feature (public / private).
 *
 * Dependency-free on purpose, so it can be unit-tested with plain node (see
 * /tmp/visibility/test-visibility.mjs) with no bundler and no React Native.
 * Nothing here reads the token or the network, and no raw JSON error body ever
 * reaches the UI: the status-to-sentence helper delegates to the Collaborators
 * mapping (gitCollaboratorModel) for the shared meanings and only overrides the
 * cases whose meaning is different for changing visibility.
 */
import { humanMessageForStatus } from "./gitCollaboratorModel";

/**
 * Short, actionable sentence for a failed repo-visibility call. 0 means the
 * request never reached GitHub (offline). 403/404/422 carry the meanings this
 * feature adds; everything else reuses the Collaborators mapping so the two
 * features stay consistent. Never includes the response body or token.
 */
export function humanMessageForVisibilityStatus(status: number): string {
  switch (status) {
    case 403:
      return "You need admin rights on this repo (or the sign-in needs the repo scope).";
    case 404:
      return "Repository not found. Check the owner/repo and your access to it.";
    case 422:
      return "Not allowed for this repository (for example a repository that cannot be made private on the current plan, or a fork in a network).";
    default:
      return humanMessageForStatus(status);
  }
}

/** "PUBLIC" / "PRIVATE" badge label. */
export function visibilityLabel(isPrivate: boolean): string {
  return isPrivate ? "PRIVATE" : "PUBLIC";
}

/** Person-framed sentence describing who can reach the repo right now. */
export function visibilityDescription(isPrivate: boolean): string {
  return isPrivate
    ? "Only you and the people you choose can see it."
    : "Anyone on the internet can see this repository.";
}

/**
 * Reads the `private` flag and `visibility` string from a
 * GET /repos/{owner}/{repo} payload. GitHub returns `private: true` for both
 * "private" and (enterprise) "internal" repos, and `visibility` is the
 * authoritative three-state field, so prefer it when present.
 */
export function isRepoPrivate(json: any): boolean {
  if (!json || typeof json !== "object") return false;
  if (typeof json.visibility === "string" && json.visibility) {
    return json.visibility !== "public";
  }
  return json.private === true;
}

/**
 * Whether the signed-in account may change the repo's visibility. Takes the
 * API's own `permissions` block rather than guessing from the owner name:
 * GitHub reports `permissions.admin === true` for owners and admins.
 */
export function canManageVisibility(json: any): boolean {
  return json?.permissions?.admin === true;
}

/**
 * The verdict shown where the control would otherwise be. Empty string when
 * the account can manage visibility (nothing to warn about).
 */
export function visibilityPermissionNote(canManage: boolean): string {
  return canManage
    ? ""
    : "Only a repository admin or owner can change this repository's visibility.";
}
