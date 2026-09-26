import { cloneUrlForRepo } from "./gitHubSearchApi";
import { cloneGitRepo, cancelClone as killGitClone } from "./gitCloneService";
import { getWorkspacesDir } from "./storagePaths";
import { getWorkspaceDirPath } from "./workspaceService";
import { showAppDialog } from "./appDialog";

/**
 * Global one-tap repo clone. Lives outside React so the clone keeps running
 * (and reporting progress) no matter which screen or tab is open — the
 * RepoCloneIndicator renders its state at the app level. On success the
 * cloned folder appears inside the current workspace (or the workspaces
 * root when none is open).
 */

/** Minimal shape a clone needs; every view can build one cheaply. */
export interface CloneTarget {
  fullName: string;
}

export interface RepoCloneState {
  /** Target currently cloning (null = idle). */
  repo: CloneTarget | null;
  /** 0-100 when git reported a percentage. */
  pct: number | null;
  /** Freshest progress line from git. */
  lastLine: string;
}

const IDLE: RepoCloneState = { repo: null, pct: null, lastLine: "" };

let state: RepoCloneState = IDLE;
let cancelled = false;
let busy = false;
const listeners = new Set<(s: RepoCloneState) => void>();

function setState(next: RepoCloneState) {
  state = next;
  for (const l of listeners) l(next);
}

export function getRepoCloneState(): RepoCloneState {
  return state;
}

/** Subscribe to clone progress; returns the unsubscribe fn. */
export function subscribeRepoClone(cb: (s: RepoCloneState) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Start a clone into the open workspace's directory (as a subfolder there).
 *  No-op while one is already running. Without a workspaceId, falls back to
 *  the workspaces root. */
export async function startRepoClone(target: CloneTarget, workspaceId?: string): Promise<void> {
  if (busy) return;
  busy = true;
  cancelled = false;
  setState({ repo: target, pct: null, lastLine: "Connecting..." });
  try {
    const url = cloneUrlForRepo(target.fullName);
    const rawDir = workspaceId ? await getWorkspaceDirPath(workspaceId) : getWorkspacesDir();
    const parentDir = rawDir.replace(/\/+$/, "");
    const res = await cloneGitRepo(url, parentDir, undefined, (line) => {
      const matches = line.match(/(\d{1,3})%/g);
      setState({
        ...state,
        pct: matches ? Math.min(100, parseInt(matches[matches.length - 1], 10)) : state.pct,
        lastLine: line,
      });
    });
    if (cancelled) return;
    setState(IDLE);
    if (res.success && res.dirPath) {
      showAppDialog({
        title: "Clone complete",
        message: `${res.folderName} cloned into the current project.`,
      });
      return;
    }
    showAppDialog({
      title: "Clone failed",
      message: res.error || `Could not clone ${target.fullName}.`,
    });
  } catch (e: any) {
    setState(IDLE);
    showAppDialog({ title: "Clone failed", message: e?.message || "Clone failed." });
  } finally {
    busy = false;
  }
}

/** Best-effort kill of the in-flight clone; state returns to idle. */
export function cancelRepoClone(): void {
  cancelled = true;
  killGitClone();
  setState(IDLE);
}
