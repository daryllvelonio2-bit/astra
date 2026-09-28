import { ghGet, ghList, GitHubResult } from "./gitHubApi";
import { GitHubCodeSearchItem, GitHubLabel, GitHubMilestone, GitHubUserSummary } from "./gitHubTypes";

/**
 * Cross-cutting GitHub search: repositories, code, issues/PRs, and users.
 * All queries are written the way github.com's own search bar does it, so
 * qualifiers like `language:ts stars:>50 org:foo` behave as users expect.
 */

const SEARCH_SEGMENT = 1000;

/** Strip characters that make the search API return 422. */
export function sanitizeQuery(query: string): string {
  return (query || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 256);
}

interface RepoSearchResponse {
  total_count?: number;
  incomplete_results?: boolean;
  items?: any[];
}

export interface RepoSearchPage {
  totalCount: number;
  incomplete: boolean;
  items: any[];
}

export async function searchRepos(
  query: string,
  options?: { sort?: "best-match" | "stars" | "forks" | "updated"; perPage?: number; page?: number }
): Promise<GitHubResult<RepoSearchPage>> {
  const q = sanitizeQuery(query);
  if (!q) return { ok: true, data: { totalCount: 0, incomplete: false, items: [] } };

  const sortParam = options?.sort && options.sort !== "best-match" ? options.sort : undefined;
  const res = await ghGet<RepoSearchResponse>("/search/repositories", {
    params: {
      q,
      sort: sortParam,
      order: sortParam ? "desc" : undefined,
      per_page: Math.min(100, Math.max(1, options?.perPage ?? 30)),
      page: options?.page ?? 1,
    },
  });
  if (!res.ok) return { ok: false, error: res.error };
  return {
    ok: true,
    data: {
      totalCount: res.data?.total_count ?? 0,
      incomplete: !!res.data?.incomplete_results,
      items: Array.isArray(res.data?.items) ? res.data!.items! : [],
    },
  };
}

interface CodeSearchResponse {
  total_count?: number;
  items?: any[];
}

export async function searchCode(
  query: string,
  perPage = 30
): Promise<GitHubResult<GitHubCodeSearchItem[]>> {
  const q = sanitizeQuery(query);
  if (!q) return { ok: true, data: [] };
  const res = await ghGet<CodeSearchResponse>("/search/code", {
    params: { q, per_page: Math.min(100, Math.max(1, perPage)) },
  });
  if (!res.ok) return { ok: false, error: res.error };
  return {
    ok: true,
    data: (res.data?.items || []).map((json: any) => ({
      path: json?.path || "",
      repoFullName: json?.repository?.full_name || "",
      repoId: json?.repository?.id ?? 0,
      htmlUrl: json?.html_url || "",
      fragments: Array.isArray(json?.text_matches)
        ? json.text_matches.map((m: any) => m?.fragment || "").filter(Boolean)
        : [],
    })),
  };
}

export async function searchUsers(
  query: string,
  perPage = 30
): Promise<GitHubResult<GitHubUserSummary[]>> {
  const q = sanitizeQuery(query);
  if (!q) return { ok: true, data: [] };
  const res = await ghGet<{ items?: any[] }>("/search/users", {
    params: { q, per_page: Math.min(100, Math.max(1, perPage)) },
  });
  if (!res.ok) return { ok: false, error: res.error };
  return {
    ok: true,
    data: (res.data?.items || []).map((json: any) => ({
      login: json?.login || "",
      name: "",
      avatarUrl: json?.avatar_url || "",
      htmlUrl: json?.html_url || "",
      kind: json?.type || "User",
    })),
  };
}

/** Clone URL (HTTPS) for a repo — the single source for clone actions. */
export function cloneUrlForRepo(fullName: string): string {
  return `https://github.com/${fullName}.git`;
}