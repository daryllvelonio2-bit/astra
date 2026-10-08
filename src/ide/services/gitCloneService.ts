import {
  executeCommand,
  executeCommandStream,
  addCommandOutputListener,
  stopCommand,
} from "../../../modules/linux-runner/src";
import { isToolchainReadyForGit } from "./toolchainGate";
import { ensureGitHubCredentials } from "./gitHubAuthService";

export interface CloneResult {
  success: boolean;
  dirPath?: string;
  folderName?: string;
  error?: string;
  needsAuth?: "token" | "ssh";
  /**
   * Whether the guest actually holds ~/.git-credentials at clone time. False
   * means an auth failure is about the environment, not about the account.
   */
  credentialsWired?: boolean;
}

const AUTH_PATTERNS = /401|403|authentication failed|authorization failed|permission denied|publickey|could not read username|terminal prompts disabled|askpass|host key verification failed/i;

let activeCloneId: string | null = null;

/** Stops an in-flight streaming clone (best-effort kill). */
export function cancelClone(): boolean {
  if (!activeCloneId) return false;
  const id = activeCloneId;
  activeCloneId = null;
  try {
    return stopCommand(id);
  } catch (_) {
    return false;
  }
}

/** True when git output indicates missing/invalid credentials. */
export function isGitAuthError(output: string): boolean {
  return AUTH_PATTERNS.test(output || "");
}

/**
 * Normalizes user input into a cloneable URL.
 * Accepts full HTTPS/SSH URLs or `user/repo` shorthand (defaults to HTTPS).
 * Returns null when the input is not recognizable.
 */
export function normalizeCloneUrl(input: string, useSsh: boolean): string | null {
  const trimmed = (input || "").trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  if (/^(https?:\/\/|git@|ssh:\/\/)/i.test(trimmed)) return trimmed;
  const short = trimmed.replace(/^github\.com\//i, "");
  if (/^[\w.-]+\/[\w.-]+$/.test(short)) {
    return useSsh ? `git@github.com:${short}.git` : `https://github.com/${short}.git`;
  }
  return null;
}

/** Derives a safe folder name from a repo URL (`.../name.git` -> `name`). */
export function folderNameFromCloneUrl(url: string): string {
  const base = (url.split("/").pop() || "repo").replace(/\.git$/i, "");
  const clean = base.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^-+|-+$/g, "");
  return clean || "repo";
}

/**
 * Clones a repo into `<parentDir>/<folderName>`.
 * Runs with cwd = parentDir (absolute host path supported by executeCommand).
 * Non-interactive: fails fast with readable errors instead of hanging on prompts.
 * Pass onProgress for live `git --progress` lines (streamed); omitting it
 * uses a single blocking call.
 */

export async function cloneGitRepo(
  url: string,
  parentDir: string,
  folderName?: string,
  onProgress?: (line: string) => void
): Promise<CloneResult> {
  // Gate: cloning needs git + TLS trust roots in the guest. Without them
  // clones fail with "server certificate verification failed. CAfile: none".
  // Refuse early with an actionable error instead.
  const toolchain = await isToolchainReadyForGit();
  if (!toolchain.ok) {
    return {
      success: false,
      error:
        "The Linux toolchain is not ready — git and its TLS certificates are missing.\nOpen the Git tab and follow the setup steps (or Settings → Linux → install the toolchain), then clone again.",
    };
  }

  const name = (folderName || folderNameFromCloneUrl(url)).trim();
  if (!name) return { success: false, error: "Could not determine a folder name." };
  if (/[\/\\]/.test(name)) return { success: false, error: "Folder name must not contain slashes." };
  const dirPath = `${parentDir.replace(/\/+$/, "")}/${name}`;

  const exists = await executeCommand(`test -e "${name}" && echo EXISTS || echo MISSING`, parentDir);
  if ((exists.stdout || "").includes("EXISTS")) {
    return { success: false, error: `A folder named "${name}" already exists here.` };
  }

  // A saved GitHub session is not enough on its own: git only authenticates via
  // the guest's ~/.git-credentials, and sign-in writes that file best-effort —
  // it is deferred when the Linux environment has not been extracted yet. A
  // fresh install or a wiped guest therefore makes a PRIVATE repo fail exactly
  // like a signed-out user ("could not read Username", terminal prompts
  // disabled), and the UI then tells someone who IS signed in to sign in again.
  // Every clone passes through here, so wire the credentials at this choke
  // point instead of trusting the login tab to have been mounted.
  let credentialsWired = false;
  try {
    credentialsWired = await ensureGitHubCredentials();
  } catch (_) {
    credentialsWired = false;
  }

  const sshCmd = "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new";
  const cmd =
    `GIT_TERMINAL_PROMPT=0 git -c core.sshCommand="${sshCmd}" clone --progress "${url}" "${name}" 2>&1`;
  const commandId = `git-clone-${Date.now()}`;
  let listener: { remove: () => void } | undefined;
  if (onProgress) {
    activeCloneId = commandId;
    listener = addCommandOutputListener(commandId, (chunk: string) => {
      // git rewrites progress in place with \r — split on both to get the
      // freshest segment of each chunk.
      for (const seg of chunk.split(/[\r\n]+/)) {
        const t = seg.trim();
        if (t) onProgress(t);
      }
    });
  }
  let out = "";
  let code = -1;
  try {
    const res = onProgress
      ? await executeCommandStream(commandId, cmd, parentDir)
      : await executeCommand(cmd, parentDir);
    out = res.stdout || "";
    code = res.exitCode;
  } catch (e: any) {
    return { success: false, error: e?.message || "Clone failed." };
  } finally {
    listener?.remove();
    if (activeCloneId === commandId) activeCloneId = null;
  }
  if (code !== 0) {
    const needsAuth = isGitAuthError(out)
      ? (/^git@/i.test(url) || url.startsWith("ssh://") ? "ssh" : "token")
      : undefined;
    const firstLine = out.split(/\r?\n/).filter(Boolean).slice(-3).join("\n").slice(0, 400);
    return {
      success: false,
      error: firstLine || "Clone failed.",
      needsAuth,
      credentialsWired,
    };
  }
  return { success: true, dirPath, folderName: name };
}
