import * as WebBrowser from "expo-web-browser";
import * as Crypto from "expo-crypto";
import { executeCommand } from "../../../modules/linux-runner/src";
import { loadConfig, saveConfig } from "./configService";
import { configureGitCredentials } from "./gitRemoteService";

/**
 * GitHub one-tap browser login: OAuth authorization-code flow + PKCE S256
 * (one feature = one file). Tap Sign in -> system browser -> approve ->
 * GitHub redirects to astra://oauth/callback straight back into the app.
 * The user's own OAuth App ID + secret are pasted once and saved; every
 * login after that is a single tap. Token storage follows the existing
 * apiKey convention (app config file); git authenticates through
 * ~/.git-credentials (0600) in the guest.
 */

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const API_BASE = "https://api.github.com";
const SCOPES = "repo read:user user:email";

/** Must match the intent-filter in AndroidManifest + the OAuth App callback URL. */
export const GITHUB_REDIRECT_URI = "astra://oauth/callback";

export interface GitHubSession {
  username: string;
  email: string;
  avatarUrl: string;
  hasToken: boolean;
}

export interface GitHubAppCredentials {
  clientId: string;
  hasSecret: boolean;
}

interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface ApiUser {
  login?: string;
  email?: string;
  avatar_url?: string;
}

function toBase64Url(b64: string): string {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function randomUrlSafe(byteCount: number): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(byteCount);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return toBase64Url(btoa(binary));
}

/** S256 code challenge for the PKCE verifier. */
async function codeChallenge(verifier: string): Promise<string> {
  const digestB64 = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  return toBase64Url(digestB64);
}

function parseQueryParams(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const query = url.split("?")[1]?.split("#")[0];
  if (!query) return out;
  for (const pair of query.split("&")) {
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    try {
      out[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1));
    } catch (_) {}
  }
  return out;
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch (_) {
    return null;
  }
}

/**
 * One-tap sign in. Opens the system browser; resolves with the access token
 * when GitHub redirects back into the app. Throws a readable error on
 * cancel / mismatch / failure.
 */
export async function signInWithBrowser(clientId: string, clientSecret: string): Promise<string> {
  const id = clientId.trim();
  const secret = clientSecret.trim();
  if (!id) throw new Error("Paste your OAuth App Client ID first.");
  if (!secret) throw new Error("Paste your OAuth App Client Secret first (one-time setup).");

  const state = await randomUrlSafe(24);
  const verifier = await randomUrlSafe(64);
  const challenge = await codeChallenge(verifier);
  const authUrl =
    `${AUTHORIZE_URL}?client_id=${encodeURIComponent(id)}` +
    `&redirect_uri=${encodeURIComponent(GITHUB_REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&state=${encodeURIComponent(state)}` +
    `&code_challenge=${encodeURIComponent(challenge)}` +
    `&code_challenge_method=S256`;

  const result = await WebBrowser.openAuthSessionAsync(authUrl, GITHUB_REDIRECT_URI);
  if (result.type !== "success" || !result.url) {
    throw new Error("Sign-in was closed before finishing.");
  }
  const params = parseQueryParams(result.url);
  if (params.error) {
    throw new Error(
      params.error === "access_denied"
        ? "You declined the authorization in the browser."
        : `GitHub: ${params.error_description || params.error}`
    );
  }
  if (!params.code) throw new Error("GitHub did not return a login code. Try again.");
  if (!params.state || params.state !== state) {
    throw new Error("Security check failed (state mismatch). Try again.");
  }

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: id,
      client_secret: secret,
      code: params.code,
      redirect_uri: GITHUB_REDIRECT_URI,
      code_verifier: verifier,
    }),
  });
  const data = await readJson<TokenResponse>(tokenRes);
  if (!tokenRes.ok || !data?.access_token) {
    const error = data?.error || "unknown_error";
    if (error === "incorrect_client_credentials") {
      throw new Error("Client ID or secret is wrong. Check your OAuth App settings.");
    }
    if (error === "redirect_uri_mismatch") {
      throw new Error(`OAuth App callback URL must be exactly ${GITHUB_REDIRECT_URI}`);
    }
    if (error === "bad_verification_code") {
      throw new Error("The login code expired. Tap Sign in again.");
    }
    throw new Error(data?.error_description || `GitHub sign-in failed (HTTP ${tokenRes.status}).`);
  }
  return data.access_token;
}

async function apiGet<T>(path: string, token: string): Promise<T | null> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch (_) {
    return null;
  }
}

/** Fetch profile + primary email, persist session, wire git credentials. */
export async function completeGitHubLogin(token: string): Promise<GitHubSession> {
  const user = await apiGet<ApiUser>("/user", token);
  const username = user?.login?.trim() || "";
  if (!username) throw new Error("Could not read your GitHub profile. Try again.");
  let email = (user?.email || "").trim();
  if (!email) {
    const emails = await apiGet<Array<{ email?: string; primary?: boolean }>>("/user/emails", token);
    email = (emails?.find((item) => item.primary)?.email || emails?.[0]?.email || "").trim();
  }
  const finalEmail = email || `${username}@users.noreply.github.com`;
  const configured = await configureGitCredentials(token, username, finalEmail);
  if (!configured) throw new Error("Signed in, but git credential wiring failed.");
  await saveConfig({
    githubToken: token,
    githubUsername: username,
    githubEmail: finalEmail,
    githubAvatarUrl: user?.avatar_url || "",
  });
  return { username, email: finalEmail, avatarUrl: user?.avatar_url || "", hasToken: true };
}

/** Saved account (token never exposed to callers). */
export async function loadGitHubSession(): Promise<GitHubSession | null> {
  const config = await loadConfig();
  if (!config.githubToken || !config.githubUsername) return null;
  return {
    username: config.githubUsername,
    email: config.githubEmail || "",
    avatarUrl: config.githubAvatarUrl || "",
    hasToken: true,
  };
}

export async function loadGitHubAppCredentials(): Promise<GitHubAppCredentials> {
  const config = await loadConfig();
  return { clientId: config.githubClientId || "", hasSecret: !!config.githubClientSecret };
}

export async function saveGitHubAppCredentials(clientId: string, clientSecret: string): Promise<void> {
  const patch: Record<string, string> = { githubClientId: clientId.trim() };
  if (clientSecret.trim()) patch.githubClientSecret = clientSecret.trim();
  await saveConfig(patch);
}

/** Secret for the exchange: freshly typed wins, otherwise the saved one. */
export async function resolveClientSecret(typed: string): Promise<string> {
  if (typed.trim()) return typed.trim();
  return (await loadConfig()).githubClientSecret || "";
}

/**
 * Re-wires ~/.git-credentials when a saved session exists but the guest
 * credential file is gone (fresh install / guest wipe). Safe to call often.
 */
export async function ensureGitHubCredentials(): Promise<boolean> {
  try {
    const config = await loadConfig();
    if (!config.githubToken || !config.githubUsername) return false;
    const check = await executeCommand("test -s ~/.git-credentials && echo OK || echo MISSING");
    if ((check.stdout || "").includes("OK")) return true;
    return configureGitCredentials(config.githubToken, config.githubUsername, config.githubEmail || "");
  } catch (_) {
    return false;
  }
}

/** Logout: forgets the token locally and removes guest git credentials. */
export async function logoutGitHub(): Promise<void> {
  await saveConfig({ githubToken: "", githubUsername: "", githubEmail: "", githubAvatarUrl: "" });
  try {
    await executeCommand(
      "rm -f ~/.git-credentials && git config --global --unset credential.helper 2>/dev/null; true"
    );
  } catch (_) {}
}
