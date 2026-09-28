import { ghDelete, ghGet, ghList, ghPatch, ghPost, ghPut, GitHubResult } from "./gitHubApi";
import {
  ContribCalendar,
  GitHubEvent,
  GitHubGist,
  GitHubNotification,
  GitHubUserDetail,
  GitHubUserSummary,
} from "./gitHubTypes";

/**
 * Account-scoped reads and writes: profile, followers/following, starred
 * state, notifications, gists, activity feed. Every mutation returns a
 * GitHubResult so callers can surface the real reason on failure.
 */

function mapUserDetail(json: any): GitHubUserDetail {
  return {
    login: json?.login || "",
    name: (json?.name || "").trim(),
    avatarUrl: json?.avatar_url || "",
    htmlUrl: json?.html_url || "",
    kind: json?.type || "User",
    bio: (json?.bio || "").trim(),
    company: (json?.company || "").trim(),
    location: (json?.location || "").trim(),
    blog: (json?.blog || "").trim(),
    twitterUsername: (json?.twitter_username || "").trim(),
    email: (json?.email || "").trim(),
    publicRepos: json?.public_repos ?? 0,
    publicGists: json?.public_gists ?? 0,
    followers: json?.followers ?? 0,
    following: json?.following ?? 0,
    createdAt: json?.created_at || "",
    isOrganization: (json?.type || "") === "Organization",
  };
}

function mapUser(json: any): GitHubUserSummary {
  return {
    login: json?.login || "",
    name: (json?.name || "").trim(),
    avatarUrl: json?.avatar_url || "",
    htmlUrl: json?.html_url || "",
    kind: json?.type || "User",
  };
}

function mapGist(json: any): GitHubGist {
  const files = Object.values(json?.files || {}) as any[];
  return {
    id: json?.id ?? "",
    description: (json?.description || "").trim(),
    isPublic: !!json?.public,
    htmlUrl: json?.html_url || "",
    createdAt: json?.created_at || "",
    updatedAt: json?.updated_at || "",
    files: files.map((f) => ({
      name: f?.filename || "",
      language: f?.language || "",
      size: f?.size ?? 0,
      content: f?.content,
    })),
    ownerLogin: json?.owner?.login || "",
    ownerAvatar: json?.owner?.avatar_url || "",
    commentCount: json?.comments ?? 0,
  };
}

/** Turn a notification's subject API URL into a browsable web URL. */
function subjectWebUrl(apiUrl: string, htmlUrl: string): string {
  if (!apiUrl) return htmlUrl || "";
  if (apiUrl.includes("/pulls/")) return apiUrl.replace("api.github.com/repos", "github.com").replace("/pulls/", "/pull/");
  if (apiUrl.includes("/issues/")) return apiUrl.replace("api.github.com/repos", "github.com").replace("/issues/", "/issues/");
  if (apiUrl.includes("/releases/")) return apiUrl.replace("api.github.com/repos", "github.com").replace("/releases/", "/releases/");
  return apiUrl.replace("api.github.com/repos", "github.com");
}

function mapNotification(json: any): GitHubNotification {
  const apiUrl = json?.subject?.url || "";
  const repoHtml = json?.repository?.html_url || "";
  return {
    id: String(json?.id ?? ""),
    unread: !!json?.unread,
    reason: json?.reason || "",
    updatedAt: json?.updated_at || "",
    subjectType: json?.subject?.type || "",
    subjectTitle: json?.subject?.title || "",
    subjectApiUrl: apiUrl,
    repoFullName: json?.repository?.full_name || "",
    repoHtmlUrl: repoHtml,
    webUrl: subjectWebUrl(apiUrl, repoHtml),
  };
}

/** Short human sentence for an activity event (no raw JSON shown to users). */
function describeEvent(json: any): string {
  const type = json?.type || "";
  const ref = (json?.payload?.ref || "").replace("refs/heads/", "");
  const size = json?.payload?.size ?? json?.payload?.commits?.length ?? 0;
  switch (type) {
    case "PushEvent":
      return `pushed ${size} commit${size === 1 ? "" : "s"} to ${ref || "a branch"}`;
    case "PullRequestEvent":
      return `${json?.payload?.action || "updated"} PR #${json?.payload?.number ?? "?"}`;
    case "IssuesEvent":
      return `${json?.payload?.action || "updated"} issue #${json?.payload?.issue?.number ?? "?"}`;
    case "IssueCommentEvent":
      return `commented on #${json?.payload?.issue?.number ?? "?"}`;
    case "CreateEvent":
      return `created ${json?.payload?.ref_type || "ref"} ${json?.payload?.ref || ""}`.trim();
    case "DeleteEvent":
      return `deleted ${json?.payload?.ref_type || "ref"} ${json?.payload?.ref || ""}`.trim();
    case "WatchEvent":
      return "starred the repository";
    case "ForkEvent":
      return "forked the repository";
    case "ReleaseEvent":
      return `${json?.payload?.action || "published"} release ${json?.payload?.release?.tag_name || ""}`.trim();
    case "PullRequestReviewEvent":
      return `${json?.payload?.action || "reviewed"} PR #${json?.payload?.pull_request?.number ?? "?"}`;
    case "PublicEvent":
      return "made the repository public";
    default:
      return type.replace(/Event$/, "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  }
}

function mapEvent(json: any): GitHubEvent {
  return {
    id: String(json?.id ?? ""),
    type: json?.type || "",
    repoFullName: json?.repo?.name || "",
    createdAt: json?.created_at || "",
    summary: describeEvent(json),
    actorLogin: json?.actor?.login || "",
    actorAvatar: json?.actor?.avatar_url || "",
  };
}

export async function fetchUserProfile(login?: string): Promise<GitHubResult<GitHubUserDetail>> {
  const path = login ? `/users/${encodeURIComponent(login)}` : "/user";
  const res = await ghGet<any>(path);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: mapUserDetail(res.data) };
}

export async function fetchFollowers(
  login?: string,
  limit = 60
): Promise<GitHubResult<GitHubUserSummary[]>> {
  const path = login ? `/users/${encodeURIComponent(login)}/followers` : "/user/followers";
  const res = await ghList<any>(path, { per_page: Math.min(100, Math.max(1, limit)) });
  if (!res.ok) return res;
  return { ok: true, data: res.data.map(mapUser) };
}

export async function fetchFollowing(
  login?: string,
  limit = 60
): Promise<GitHubResult<GitHubUserSummary[]>> {
  const path = login ? `/users/${encodeURIComponent(login)}/following` : "/user/following";
  const res = await ghList<any>(path, { per_page: Math.min(100, Math.max(1, limit)) });
  if (!res.ok) return res;
  return { ok: true, data: res.data.map(mapUser) };
}

export function followUser(login: string): Promise<GitHubResult<unknown>> {
  return ghPut(`/user/following/${encodeURIComponent(login)}`);
}

export async function unfollowUser(login: string): Promise<GitHubResult<unknown>> {
  return ghDelete(`/user/following/${encodeURIComponent(login)}`);
}

export function isFollowing(login: string): Promise<boolean> {
  return ghGet(`/user/following/${encodeURIComponent(login)}`).then((res) => res.ok);
}

export function starRepo(owner: string, repo: string): Promise<GitHubResult<unknown>> {
  return ghPut(`/user/starred/${owner}/${repo}`);
}

export async function unstarRepo(owner: string, repo: string): Promise<GitHubResult<unknown>> {
  return ghDelete(`/user/starred/${owner}/${repo}`);
}

export function watchRepo(owner: string, repo: string): Promise<GitHubResult<unknown>> {
  return ghPut(`/repos/${owner}/${repo}/subscription`, { subscribed: true });
}

export function forkRepo(owner: string, repo: string): Promise<GitHubResult<unknown>> {
  return ghPost(`/repos/${owner}/${repo}/forks`);
}

export async function fetchNotifications(
  options?: { all?: boolean; limit?: number }
): Promise<GitHubResult<GitHubNotification[]>> {
  const res = await ghList<any>("/notifications", {
    all: options?.all ?? false,
    per_page: Math.min(100, Math.max(1, options?.limit ?? 50)),
  });
  if (!res.ok) return res;
  return { ok: true, data: res.data.map(mapNotification) };
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const res = await fetchNotifications({ limit: 1 });
  if (!res.ok) return 0;
  return res.data.filter((n) => n.unread).length;
}

export async function markNotificationRead(id: string): Promise<GitHubResult<unknown>> {
  return ghPatch(`/notifications/threads/${encodeURIComponent(id)}`);
}

/** Mark every notification as read (single call, scoped to the whole inbox). */
export function markAllNotificationsRead(): Promise<GitHubResult<unknown>> {
  return ghPut("/notifications", {});
}

export async function fetchGists(
  login?: string,
  limit = 40
): Promise<GitHubResult<GitHubGist[]>> {
  const path = login ? `/users/${encodeURIComponent(login)}/gists` : "/gists";
  const res = await ghList<any>(path, { per_page: Math.min(100, Math.max(1, limit)) });
  if (!res.ok) return res;
  return { ok: true, data: res.data.map(mapGist) };
}

export async function fetchStarred(
  login?: string,
  limit = 100
): Promise<GitHubResult<Array<{ repo: any; starredAt: string }>>> {
  const path = login ? `/users/${encodeURIComponent(login)}/starred` : "/user/starred";
  const res = await ghList<any>(path, { per_page: Math.min(100, Math.max(1, limit)) });
  if (!res.ok) return res;
  return {
    ok: true,
    data: res.data.map((json) => ({
      repo: json?.repo ? json.repo : json,
      starredAt: json?.starred_at || json?.updated_at || "",
    })),
  };
}

/** Orgs the signed-in user belongs to. */
export async function fetchMyOrgs(limit = 50): Promise<GitHubResult<GitHubUserSummary[]>> {
  const res = await ghList<any>("/user/orgs", { per_page: Math.min(100, Math.max(1, limit)) });
  if (!res.ok) return res;
  return { ok: true, data: res.data.map(mapUser) };
}

/** Public activity feed (works for any user, signed in or not). */
export async function fetchUserEvents(
  login: string,
  limit = 40
): Promise<GitHubResult<GitHubEvent[]>> {
  const handle = (login || "").trim();
  if (!handle) return { ok: true, data: [] };
  const res = await ghList<any>(`/users/${encodeURIComponent(handle)}/events/public`, {
    per_page: Math.min(100, Math.max(1, limit)),
  });
  if (!res.ok) return res;
  return { ok: true, data: res.data.map(mapEvent) };
}

/** People the signed-in user follows, as a feed (@login/events won't do it). */
export async function fetchReceivedEvents(
  login: string,
  limit = 50
): Promise<GitHubResult<GitHubEvent[]>> {
  const handle = (login || "").trim();
  if (!handle) return { ok: true, data: [] };
  const res = await ghList<any>(`/users/${encodeURIComponent(handle)}/received_events/public`, {
    per_page: Math.min(100, Math.max(1, limit)),
  });
  if (!res.ok) return res;
  return { ok: true, data: res.data.map(mapEvent) };
}

export { mapUser as mapGitHubUser, mapUserDetail as mapGitHubUserDetail };

const CONTRIB_QUERY = `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{date contributionCount color}}}}}}`;

const contribCalendarCache = new Map<string, { data: ContribCalendar; at: number }>();
const inFlightCalendar = new Map<string, Promise<GitHubResult<ContribCalendar>>>();
const CALENDAR_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes cache

export function invalidateContributionCalendarCache(login?: string): void {
  if (login) {
    contribCalendarCache.delete(login.trim());
  } else {
    contribCalendarCache.clear();
  }
}

/**
 * Full-year contributions calendar via GraphQL (REST has no equivalent).
 * Colors are GitHub's own per-day greens. Results are cached in-memory
 * (30-min TTL + in-flight deduplication) for instantaneous subsequent opens.
 */
export async function fetchContributionCalendar(login: string): Promise<GitHubResult<ContribCalendar>> {
  const handle = (login || "").trim();
  if (!handle) {
    return { ok: false, error: { status: 0, rateLimited: false, scopeMissing: false, message: "Missing login." } };
  }

  const cached = contribCalendarCache.get(handle);
  if (cached && Date.now() - cached.at < CALENDAR_CACHE_TTL_MS) {
    return { ok: true, data: cached.data };
  }

  if (inFlightCalendar.has(handle)) {
    return inFlightCalendar.get(handle)!;
  }

  const fetchPromise = (async () => {
    try {
      const res = await ghPost<any>("/graphql", { query: CONTRIB_QUERY, variables: { login: handle } });
      if (!res.ok) return { ok: false as const, error: res.error };
      const payload = res.data;
      if (payload?.errors?.length) throw new Error(payload.errors[0]?.message || "GraphQL error.");
      const cal = payload?.data?.user?.contributionsCollection?.contributionCalendar;
      if (!cal || !Array.isArray(cal.weeks)) throw new Error("No calendar.");
      const data: ContribCalendar = {
        total: cal.totalContributions ?? 0,
        weeks: cal.weeks.map((w: any) =>
          (w?.contributionDays || []).map((d: any) => ({
            date: String(d?.date || ""),
            count: d?.contributionCount ?? 0,
            color: String(d?.color || "#ebedf0"),
          }))
        ),
      };
      contribCalendarCache.set(handle, { data, at: Date.now() });
      return { ok: true as const, data };
    } catch (e: any) {
      return {
        ok: false as const,
        error: { status: 200, rateLimited: false, scopeMissing: false, message: e?.message || "Could not load contributions." },
      };
    } finally {
      inFlightCalendar.delete(handle);
    }
  })();

  inFlightCalendar.set(handle, fetchPromise);
  return fetchPromise;
}