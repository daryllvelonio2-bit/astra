import { executeCommand } from "../../../modules/linux-runner/src";

export interface GitHubRepoRef {
  owner: string;
  repo: string;
}

export interface CommitAvatarMap {
  bySha: Record<string, string>;
  byEmail: Record<string, string>;
}

// In-memory cache per repo (authed or public results only — failures are
// never cached so a later retry can succeed).
const avatarCache = new Map<string, CommitAvatarMap>();

/**
 * Reads the user's saved GitHub token (stored by the credentials modal in
 * ~/.git-credentials) for authenticated API calls. Returns null when absent.
 */
export async function getGitHubApiToken(): Promise<string | null> {
  try {
    const res = await executeCommand("cat ~/.git-credentials 2>/dev/null");
    if (res.exitCode !== 0) return null;
    for (const line of (res.stdout || "").split(/\r?\n/)) {
      const m = line.trim().match(/^https?:\/\/[^:]+:([^@]+)@github\.com/i);
      if (m) {
        try {
          return decodeURIComponent(m[1]);
        } catch (_) {
          return m[1];
        }
      }
    }
    return null;
  } catch (_) {
    return null;
  }
}

/** Extracts owner/repo from HTTPS, SSH, or shorthand GitHub remotes. */
export function parseGitHubRepo(remoteUrl?: string | null): GitHubRepoRef | null {
  const raw = (remoteUrl || "").trim();
  if (!raw) return null;
  let m = raw.match(/^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i);
  if (m) return { owner: m[1], repo: m[2] };
  m = raw.match(/^(?:git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i);
  if (m) return { owner: m[1], repo: m[2] };
  m = raw.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (m) return { owner: m[1], repo: m[2] };
  return null;
}

/**
 * Maps commits to GitHub avatar URLs via the commits API, indexed by both
 * full SHA and lowercase author email (rebased/cherry-picked commits change
 * SHA but keep the email). Pass the user's token for private repos and a
 * 5,000/hr quota; without it, public repos only (60/hr). Results cached per
 * repo; failures are never cached so retries can succeed. Never throws.
 */
export async function fetchCommitAvatars(
  owner: string,
  repo: string,
  token?: string
): Promise<CommitAvatarMap> {
  const key = `${owner}/${repo}`.toLowerCase();
  const cached = avatarCache.get(key);
  if (cached) return cached;
  const empty: CommitAvatarMap = { bySha: {}, byEmail: {} };
  try {
    const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const map: CommitAvatarMap = { bySha: {}, byEmail: {} };
    // Two pages cover ~200 commits; enough for a history list.
    for (let page = 1; page <= 2; page++) {
      const res = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?per_page=100&page=${page}`,
        { headers }
      );
      if (!res.ok) return empty;
      const list: any[] = await res.json();
      if (!Array.isArray(list) || list.length === 0) break;
      for (const c of list) {
        const sha = typeof c?.sha === "string" ? c.sha : "";
        const url = typeof c?.author?.avatar_url === "string" ? c.author.avatar_url : "";
        const email =
          typeof c?.commit?.author?.email === "string"
            ? c.commit.author.email.trim().toLowerCase()
            : "";
        if (sha && url) map.bySha[sha] = url;
        if (email && url) map.byEmail[email] = url;
      }
      if (list.length < 100) break;
    }
    if (Object.keys(map.bySha).length > 0 || Object.keys(map.byEmail).length > 0) {
      avatarCache.set(key, map);
    }
    return map;
  } catch (_) {
    return empty;
  }
}

/**
 * Gravatar fallback for authors GitHub can't map to an account (author is
 * null in the API when the commit email isn't linked). `d=404` makes unknown
 * emails fail cleanly so the UI falls back to initials.
 */
export function gravatarUrl(email?: string | null): string | null {
  const clean = (email || "").trim().toLowerCase();
  if (!clean || !clean.includes("@")) return null;
  return `https://www.gravatar.com/avatar/${md5Hex(clean)}?s=80&d=404`;
}

// Compact MD5 (RFC 1321), ASCII-only input — emails are always ASCII.
function md5Hex(input: string): string {
  const words = (((input.length + 8) >>> 6) + 1) * 16;
  const x: number[] = new Array(words).fill(0);
  for (let i = 0; i < input.length; i++) x[i >> 2] |= input.charCodeAt(i) << ((i % 4) << 3);
  x[input.length >> 2] |= 0x80 << ((input.length % 4) << 3);
  // 64-bit little-endian bit length occupies the last 8 bytes: low word at
  // words-2, high word (always 0 for short inputs) at words-1.
  x[words - 2] = input.length << 3;

  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  const rol = (n: number, k: number) => (n << k) | (n >>> (32 - k));
  const F = (X: number, Y: number, Z: number) => (X & Y) | (~X & Z);
  const G = (X: number, Y: number, Z: number) => (X & Z) | (Y & ~Z);
  const H = (X: number, Y: number, Z: number) => X ^ Y ^ Z;
  const I = (X: number, Y: number, Z: number) => Y ^ (X | ~Z);
  const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  const K = [
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
    0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
    0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
    0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
    0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
    0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391];

  for (let i = 0; i < words; i += 16) {
    const oa = a, ob = b, oc = c, od = d;
    for (let j = 0; j < 64; j++) {
      let f: number, g: number;
      if (j < 16) { f = F(b, c, d); g = j; }
      else if (j < 32) { f = G(b, c, d); g = (5 * j + 1) % 16; }
      else if (j < 48) { f = H(b, c, d); g = (3 * j + 5) % 16; }
      else { f = I(b, c, d); g = (7 * j) % 16; }
      const tmp = d;
      d = c;
      c = b;
      b = (b + rol((a + f + K[j] + x[i + g]) | 0, S[j])) | 0;
      a = tmp;
    }
    a = (a + oa) | 0;
    b = (b + ob) | 0;
    c = (c + oc) | 0;
    d = (d + od) | 0;
  }

  const wordHex = (n: number) => {
    let out = "";
    for (let j = 0; j < 4; j++) out += ("0" + ((n >>> (j * 8)) & 0xff).toString(16)).slice(-2);
    return out;
  };
  return wordHex(a) + wordHex(b) + wordHex(c) + wordHex(d);
}
