import { executeCommand } from "../../../modules/linux-runner/src";
import { loadConfig, saveConfig } from "./configService";
import { configureGitCredentials } from "./gitRemoteService";

/**
 * GitHub sign-in via the OAuth **device flow** — the same method `gh` and
 * VS Code use. Astra shows an 8-character code, the system browser opens
 * github.com/login/device, the user approves there, and Astra polls until
 * GitHub hands back the token. No client secret, no callback redirect, and
 * no manifest intent-filter required.
 *
 * Astra ships with its own public OAuth App Client ID (DEFAULT_CLIENT_ID).
 * It is a public identifier by design — the device flow's security model
 * never has a secret in the app, and users configure nothing: tap Sign in,
 * copy the code, open GitHub, approve.
 */

const DEVICE_CODE_URL = "https://github.com/login/device/code";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
const API_BASE = "https://api.github.com";
const SCOPES = "repo read:user user:email";

/** Astra's public OAuth App client ID (device flow — no secret exists). */
const DEFAULT_CLIENT_ID = "Ov23liKNnfWWBaAsfR4o";

export interface GitHubSession {
  username: string;
  email: string;
  avatarUrl: string;
  hasToken: boolean;
}

export interface DeviceFlowSession {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  intervalSeconds: number;
  expiresInSeconds: number;
}

interface DeviceCodeResponse {
  device_code?: string;
  user_code?: string;
  verification_uri?: string;
  expires_in?: number;
  interval?: number;
  error?: string;
  error_description?: string;
}

interface DeviceTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface ApiUser {
  login?: string;
  email?: string;
  avatar_url?: string;
}

async function postForm(url: string, fields: Record<string, string>): Promise<Response> {
  const body = Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch (_) {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Step 1: ask GitHub for a device code to display. */
export async function startGitHubDeviceFlow(): Promise<DeviceFlowSession> {
  const response = await postForm(DEVICE_CODE_URL, { client_id: DEFAULT_CLIENT_ID, scope: SCOPES });
  const data = await readJson<DeviceCodeResponse>(response);

  if (!response.ok || !data?.device_code || !data.user_code) {
    if (response.status === 404) {
      throw new Error(
        "GitHub returned 404 - 'Enable device flow' is not checked in your OAuth App settings."
      );
    }
    if (data?.error === "incorrect_client_credentials" || response.status === 401) {
      throw new Error("That Client ID was not recognized. Check your OAuth App page.");
    }
    throw new Error(data?.error_description || `GitHub sign-in failed (HTTP ${response.status}).`);
  }

  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri || "https://github.com/login/device",
    intervalSeconds: Math.max(1, data.interval || 5),
    expiresInSeconds: data.expires_in || 900,
  };
}

/**
 * Step 2: poll until the user approves in the browser.
 * Resolves with the access token, or null if cancelled via isCancelled().
 */
export async function waitForDeviceFlowApproval(
  session: DeviceFlowSession,
  isCancelled: () => boolean
): Promise<string | null> {
  let interval = session.intervalSeconds;
  const deadline = Date.now() + session.expiresInSeconds * 1000;

  while (Date.now() < deadline) {
    await sleep(interval * 1000);
    if (isCancelled()) return null;

    const response = await postForm(TOKEN_URL, {
      client_id: DEFAULT_CLIENT_ID,
      device_code: session.deviceCode,
      grant_type: DEVICE_GRANT,
    });
    const data = await readJson<DeviceTokenResponse>(response);
    const error = data?.error || "";

    if (data?.access_token) return data.access_token;

    if (error === "authorization_pending") continue;
    if (error === "slow_down") {
      interval += 5;
      continue;
    }
    if (error === "expired_token") throw new Error("The code expired. Tap Sign in again.");
    if (error === "access_denied") throw new Error("You cancelled the authorization in the browser.");
    throw new Error(data?.error_description || "GitHub sign-in failed while waiting for approval.");
  }
  throw new Error("The code expired before it was approved. Tap Sign in again.");
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
