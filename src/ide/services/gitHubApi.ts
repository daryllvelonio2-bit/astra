import { loadConfig } from "./configService";

/**
 * Core GitHub REST layer. Every call goes through `request`, which turns
 * HTTP failures into actionable messages (token rejected, rate limited,
 * missing scope) instead of silently returning null the way the old
 * profile-only helper did. The token never leaves this module.
 */

const API_BASE = "https://api.github.com";
const TOKEN_TTL_MS = 1500;

export interface GitHubApiError {
  /** HTTP status; 0 = network failure before a response. */
  status: number;
  /** Human-readable, actionable. */
  message: string;
  rateLimited: boolean;
  scopeMissing: boolean;
}

export interface GitHubOk<T> {
  ok: true;
  data: T;
  error?: undefined;
}

export interface GitHubErr {
  ok: false;
  error: GitHubApiError;
  data?: undefined;
}

/** Discriminated on `ok`, with both branches carrying the counterpart key
 *  (optional) so narrowing holds after awaits and across generics. */
export type GitHubResult<T> = GitHubOk<T> | GitHubErr;

export interface RequestOptions {
  params?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Override Accept (e.g. raw diff or patch media types). */
  accept?: string;
}

let tokenCache: { value: string; at: number } | null = null;

/** Drop the memoized token (call after sign-in / sign-out). */
export function invalidateGitHubTokenCache(): void {
  tokenCache = null;
}

/** Saved device-flow token, or "" when signed out. Memoized briefly. */
export async function getGitHubToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && now - tokenCache.at < TOKEN_TTL_MS) return tokenCache.value;
  let value = "";
  try {
    value = (await loadConfig()).githubToken || "";
  } catch (_) {
    value = "";
  }
  tokenCache = { value, at: now };
  return value;
}

export async function isGitHubSignedIn(): Promise<boolean> {
  return !!(await getGitHubToken());
}

function buildUrl(path: string, params?: RequestOptions["params"]): string {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  if (!params) return url;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  if (parts.length === 0) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${parts.join("&")}`;
}

function describeError(status: number, headers: Headers, payload: any): GitHubApiError {
  const remaining = headers.get("x-ratelimit-remaining");
  const apiMessage = typeof payload?.message === "string" ? payload.message : "";

  if (status === 401) {
    return {
      status,
      rateLimited: false,
      scopeMissing: false,
      message: "GitHub rejected the saved token. Sign out and sign in again.",
    };
  }
  if (status === 403 && remaining === "0") {
    return {
      status,
      rateLimited: true,
      scopeMissing: false,
      message: "GitHub API rate limit reached. Wait a few minutes, then retry.",
    };
  }
  if (status === 403) {
    return {
      status,
      rateLimited: false,
      scopeMissing: true,
      message: apiMessage || "The saved token lacks the scope this action needs.",
    };
  }
  if (status === 404) {
    return {
      status,
      rateLimited: false,
      scopeMissing: false,
      message: apiMessage || "Not found — it may be private, or the token cannot see it.",
    };
  }
  if (status === 422 && Array.isArray(payload?.errors) && payload.errors.length > 0) {
    const first = payload.errors[0];
    return {
      status,
      rateLimited: false,
      scopeMissing: false,
      message: first?.message || first?.field || apiMessage || "GitHub rejected the request.",
    };
  }
  return {
    status,
    rateLimited: false,
    scopeMissing: false,
    message: apiMessage || `GitHub request failed (HTTP ${status}).`,
  };
}

async function request<T>(method: string, path: string, options?: RequestOptions): Promise<GitHubResult<T>> {
  const token = await getGitHubToken();
  const url = buildUrl(path, options?.params);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: options?.accept || "application/vnd.github+json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "User-Agent": "astra-mobile-ide",
        ...(options?.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (e: any) {
    return {
      ok: false,
      error: {
        status: 0,
        rateLimited: false,
        scopeMissing: false,
        message: e?.message || "Network request failed.",
      },
    };
  }

  const text = await response.text().catch(() => "");
  let payload: any = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (_) {
      payload = text;
    }
  }

  if (!response.ok) {
    return { ok: false, error: describeError(response.status, response.headers, payload) };
  }
  return { ok: true, data: payload as T };
}

export function ghGet<T>(path: string, options?: RequestOptions): Promise<GitHubResult<T>> {
  return request<T>("GET", path, options);
}

export function ghPost<T>(path: string, body?: unknown, options?: RequestOptions): Promise<GitHubResult<T>> {
  return request<T>("POST", path, { ...options, body: body ?? {} });
}

export function ghPatch<T>(path: string, body?: unknown): Promise<GitHubResult<T>> {
  return request<T>("PATCH", path, { body: body ?? {} });
}

export function ghPut<T>(path: string, body?: unknown): Promise<GitHubResult<T>> {
  return request<T>("PUT", path, { body: body ?? {} });
}

export function ghDelete<T>(path: string, body?: unknown): Promise<GitHubResult<T>> {
  return request<T>("DELETE", path, body !== undefined ? { body } : undefined);
}

/**
 * GraphQL v4. Used where REST would need one request per item (e.g. the
 * last commit for every row in a folder) — aliases collapse that into a
 * single call. A 200 response can still carry `errors`, so callers must
 * check the payload shape instead of trusting `ok` alone.
 */
export function ghGraphQL<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<GitHubResult<T>> {
  return request<T>("POST", "/graphql", { body: { query, variables: variables || {} } });
}

/** Follow `Link: rel="next"` up to `maxPages`; returns everything collected. */
export async function ghListAll<T>(
  path: string,
  options?: RequestOptions,
  maxPages = 3
): Promise<GitHubResult<T[]>> {
  const collected: T[] = [];
  let nextPath: string | null = buildUrl(path, options?.params);
  let page = 0;

  while (nextPath && page < maxPages) {
    page++;
    const token = await getGitHubToken();
    let response: Response;
    try {
      response = await fetch(nextPath, {
        method: "GET",
        headers: {
          Accept: options?.accept || "application/vnd.github+json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "User-Agent": "astra-mobile-ide",
        },
      });
    } catch (e: any) {
      if (collected.length > 0) return { ok: true, data: collected };
      return {
        ok: false,
        error: { status: 0, rateLimited: false, scopeMissing: false, message: e?.message || "Network request failed." },
      };
    }

    if (!response.ok) {
      if (collected.length > 0) return { ok: true, data: collected };
      const text = await response.text().catch(() => "");
      let payload: any = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch (_) {
        payload = text;
      }
      return { ok: false, error: describeError(response.status, response.headers, payload) };
    }

    const batch = (await response.json().catch(() => [])) as T[];
    if (Array.isArray(batch)) collected.push(...batch);

    const link = response.headers.get("link") || "";
    const match = link.split(",").find((part) => part.includes('rel="next"'));
    const href = match?.match(/<([^>]+)>/)?.[1];
    nextPath = href || null;
  }

  return { ok: true, data: collected };
}

/** First page of a list endpoint (most callers only want 30-100 rows). */
export function ghList<T>(path: string, params?: RequestOptions["params"]): Promise<GitHubResult<T[]>> {
  return ghGet<T[]>(path, { params });
}

/**
 * Fetch a URL as plain text (raw media type). Used for file contents and
 * diffs, which are not JSON — avoids shipping a base64 decoder.
 */
export async function ghGetText(path: string, options?: RequestOptions): Promise<GitHubResult<string>> {
  const token = await getGitHubToken();
  const url = buildUrl(path, options?.params);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: options?.accept || "application/vnd.github.raw",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "User-Agent": "astra-mobile-ide",
      },
    });
    const body = await response.text().catch(() => "");
    if (!response.ok) {
      let payload: any = null;
      try {
        payload = body ? JSON.parse(body) : null;
      } catch (_) {
        payload = body;
      }
      return { ok: false, error: describeError(response.status, response.headers, payload) };
    }
    return { ok: true, data: body };
  } catch (e: any) {
    return {
      ok: false,
      error: { status: 0, rateLimited: false, scopeMissing: false, message: e?.message || "Network request failed." },
    };
  }
}