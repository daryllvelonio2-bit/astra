import { executeCommand } from "../../../modules/linux-runner/src";
import { invalidateGitStatusCache } from "./gitStatusCache";

/** Remote + credential operations (one feature = one file; re-exported by gitService). */

export async function configureGitCredentials(token: string, username: string, email: string): Promise<boolean> {
  try {
    const cmds = [
      `git config --global user.name "${username}"`,
      `git config --global user.email "${email}"`,
      `git config --global credential.helper store`,
      `echo "https://${encodeURIComponent(username)}:${encodeURIComponent(token)}@github.com" > ~/.git-credentials`,
      `chmod 600 ~/.git-credentials`,
    ];
    return (await executeCommand(cmds.join(" && "))).exitCode === 0;
  } catch (_) {
    return false;
  }
}

export async function getSshPublicKey(): Promise<string | null> {
  try {
    const res = await executeCommand("cat ~/.ssh/id_ed25519.pub 2>/dev/null || cat ~/.ssh/id_rsa.pub 2>/dev/null");
    if (res.exitCode !== 0) return null;
    return (res.stdout || "").trim() || null;
  } catch (_) {
    return null;
  }
}

export async function generateSshKey(email?: string): Promise<{ success: boolean; publicKey?: string; error?: string }> {
  try {
    const comment = email?.trim() || "astra-git";
    const setupCmds = [
      "mkdir -p ~/.ssh",
      "chmod 700 ~/.ssh",
      `ssh-keygen -t ed25519 -C "${comment}" -f ~/.ssh/id_ed25519 -N "" -q`,
      "chmod 600 ~/.ssh/id_ed25519",
      "chmod 644 ~/.ssh/id_ed25519.pub",
      `printf "Host github.com\\n  StrictHostKeyChecking accept-new\\n  IdentityFile ~/.ssh/id_ed25519\\n" > ~/.ssh/config`,
      "chmod 600 ~/.ssh/config",
    ];
    const res = await executeCommand(setupCmds.join(" && "));
    if (res.exitCode !== 0) return { success: false, error: res.stdout || "Failed to generate SSH key" };
    const pub = await getSshPublicKey();
    return { success: !!pub, publicKey: pub || undefined };
  } catch (e: any) {
    return { success: false, error: e?.message || "Failed to generate SSH key" };
  }
}

export async function getGitRemoteUrl(workspaceId?: string): Promise<string | null> {
  try {
    const res = await executeCommand("git remote get-url origin", workspaceId);
    if (res.exitCode !== 0) return null;
    const url = (res.stdout || "").trim();
    if (!url || url.toLowerCase().startsWith("error") || url.toLowerCase().startsWith("fatal")) return null;
    return url;
  } catch (_) {
    return null;
  }
}

export async function setGitRemoteUrl(
  workspaceId: string | undefined,
  url: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanUrl = url.trim();
    if (!cleanUrl) {
      const removeRes = await executeCommand("git remote remove origin", workspaceId);
      invalidateGitStatusCache(workspaceId);
      return { success: removeRes.exitCode === 0, error: removeRes.exitCode === 0 ? undefined : removeRes.stdout };
    }
    const cmd = `(git remote remove origin 2>/dev/null || true) && git remote add origin "${cleanUrl}"`;
    const res = await executeCommand(cmd, workspaceId);
    if (res.exitCode === 0) {
      invalidateGitStatusCache(workspaceId);
      return { success: true };
    }
    const setRes = await executeCommand(`git remote set-url origin "${cleanUrl}"`, workspaceId);
    invalidateGitStatusCache(workspaceId);
    if (setRes.exitCode === 0) return { success: true };
    return { success: false, error: res.stdout || setRes.stdout || "Failed to set remote URL" };
  } catch (e: any) {
    invalidateGitStatusCache(workspaceId);
    return { success: false, error: e?.message || "Failed to set remote URL" };
  }
}
