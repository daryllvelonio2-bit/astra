/**
 * Pure model for the GitHub Collaborators feature: formatting and error
 * translation only. Dependency-free so it can be unit-tested with plain node
 * (see /tmp/collab/test-collab.mjs). Nothing here reads the token or the
 * network, and no raw JSON error body ever reaches the UI.
 */

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

/** "owner/repo" for display, or "" when the ref is missing. */
export function repoFullName(ref: { owner: string; repo: string } | null | undefined): string {
  return ref ? `${ref.owner}/${ref.repo}` : "";
}
