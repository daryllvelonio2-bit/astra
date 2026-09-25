import { loadConfig } from "./configService";

/**
 * Read-only GitHub account data for the profile popup. Uses the device-flow
 * token already saved by gitHubAuthService (scopes: repo read:user user:email);
 * the token itself never leaves this service layer.
 */

const API_BASE = "https://api.github.com";

export interface GitHubProfile {
  login: string;
  name: string;
  avatarUrl: string;
  bio: string;
  company: string;
  location: string;
  blog: string;
  twitterUsername: string;
  publicRepos: number;
  publicGists: number;
  followers: number;
  following: number;
  createdAt: string; // ISO
  htmlUrl: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  description: string;
  isPrivate: boolean;
  isFork: boolean;
  language: string;
  stars: number;
  forks: number;
  updatedAt: string; // ISO
  htmlUrl: string;
  defaultBranch: string;
}

interface ApiUser {
  login?: string;
  name?: string | null;
  avatar_url?: string;
  bio?: string | null;
  company?: string | null;
  location?: string | null;
  blog?: string | null;
  twitter_username?: string | null;
  public_repos?: number;
  public_gists?: number;
  followers?: number;
  following?: number;
  created_at?: string;
  html_url?: string;
}

interface ApiRepo {
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

async function apiGet<T>(path: string, token: string): Promise<T | null> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "astra-mobile-ide",
      },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch (_) {
    return null;
  }
}

/** "" when signed out. */
async function getToken(): Promise<string> {
  const config = await loadConfig();
  return config.githubToken || "";
}

export async function isSignedIn(): Promise<boolean> {
  return !!(await getToken());
}

/** Profile of the signed-in user, or null (signed out / network failure). */
export async function fetchMyProfile(): Promise<GitHubProfile | null> {
  const token = await getToken();
  if (!token) return null;
  const user = await apiGet<ApiUser>("/user", token);
  if (!user?.login) return null;
  return {
    login: user.login,
    name: (user.name || "").trim(),
    avatarUrl: user.avatar_url || "",
    bio: (user.bio || "").trim(),
    company: (user.company || "").trim(),
    location: (user.location || "").trim(),
    blog: (user.blog || "").trim(),
    twitterUsername: (user.twitter_username || "").trim(),
    publicRepos: user.public_repos ?? 0,
    publicGists: user.public_gists ?? 0,
    followers: user.followers ?? 0,
    following: user.following ?? 0,
    createdAt: user.created_at || "",
    htmlUrl: user.html_url || `https://github.com/${user.login}`,
  };
}

/** Repos of the signed-in user (owner-only visibility included), most recent first. */
export async function fetchMyRepos(limit = 100): Promise<GitHubRepo[] | null> {
  const token = await getToken();
  if (!token) return null;
  const perPage = Math.min(100, Math.max(1, limit));
  const items = await apiGet<ApiRepo[]>(`/user/repos?per_page=${perPage}&sort=updated`, token);
  if (!items) return null;
  return items.map((repo) => ({
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
  }));
}

/** "3h ago" style staleness for repo rows. */
export function formatStale(iso: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Math.max(0, Date.now() - then) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 86400 * 365) return `${Math.floor(diff / (86400 * 30))}mo ago`;
  return `${Math.floor(diff / (86400 * 365))}y ago`;
}

/** "Joined Mar 2021" from an ISO date. */
export function formatJoined(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `Joined ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}
