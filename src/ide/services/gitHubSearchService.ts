import { loadConfig } from "./configService";
import { apiGet, GitHubRepo } from "./gitHubProfileService";

/**
 * Public GitHub repository search (works for any repo, not just the
 * signed-in user's). Uses the stored token when present (higher quota,
 * includes the user's private repos when the query matches them); falls
 * back to unauthenticated public search otherwise. Read-only — the token
 * itself never leaves this service layer.
 */

interface ApiSearchItem {
  id?: number;
  name?: string;
  full_name?: string;
  description?: string | null;
  private?: boolean;
  fork?: boolean;
  language?: string | null;
  stargazers_count?: number;
  forks_count?: number;
  updated_at?: string;
  html_url?: string;
  default_branch?: string;
}

interface ApiSearchResponse {
  items?: ApiSearchItem[];
}

function mapRepo(repo: ApiSearchItem): GitHubRepo {
  return {
    id: repo.id ?? 0,
    name: repo.name || "",
    fullName: repo.full_name || repo.name || "",
    description: (repo.description || "").trim(),
    isPrivate: !!repo.private,
    isFork: !!repo.fork,
    language: (repo.language || "").trim(),
    stars: repo.stargazers_count ?? 0,
    forks: repo.forks_count ?? 0,
    updatedAt: repo.updated_at || "",
    htmlUrl: repo.html_url || "",
    defaultBranch: repo.default_branch || "main",
  };
}

/**
 * Search public GitHub repositories. Returns [] for an empty query, null on
 * network/API failure. Results are sorted by stars (GitHub default is best
 * match; we keep that — it surfaces popular repos first on mobile).
 */
export async function searchGitHubRepos(query: string, perPage = 30): Promise<GitHubRepo[] | null> {
  const q = (query || "").trim();
  if (!q) return [];
  const token = (await loadConfig()).githubToken || "";
  const path = `/search/repositories?q=${encodeURIComponent(q)}&per_page=${Math.min(50, Math.max(1, perPage))}`;
  const res = await apiGet<ApiSearchResponse>(path, token);
  if (!res || !Array.isArray(res.items)) return null;
  return res.items.map(mapRepo);
}

/** Clone URL (HTTPS) for a repo row — the single source for clone actions. */
export function cloneUrlForRepo(repo: GitHubRepo): string {
  const full = repo.fullName || repo.name;
  return `https://github.com/${full}.git`;
}
