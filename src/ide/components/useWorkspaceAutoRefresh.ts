import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import {
  subscribeWorkspaceChanges,
  getWorkspaceDirPath,
  Workspace,
} from "../services/workspaceService";
import { loadWorkspaceShallow } from "../services/workspaceTreeService";
import { readDirectoryNative } from "../services/nativeFs";
import {
  computeWorkspaceFingerprint,
  computeWorkspaceFingerprintAsync,
  FingerprintStats,
} from "../services/workspaceWatcherService";

const DEBOUNCE_MS = 600;
const POLL_INTERVAL_MS = 2500;
/** Slow trees back the poll off so the JS thread isn't permanently busy. */
const POLL_INTERVAL_SLOW_MS = 15000;
const POLL_INTERVAL_VERYSLOW_MS = 30000;
const SLOW_FP_MS = 750;
const VERYSLOW_FP_MS = 2000;
const LOAD_TIMEOUT_MS = 30000;

/** Module-level pause (set by useSidebarResizer while dragging). */
let watcherPausedExternal = false;
export function setWorkspaceWatcherPaused(paused: boolean): void {
  watcherPausedExternal = paused;
}

function timeout<T>(ms: number): Promise<T | undefined> {
  return new Promise((resolve) => setTimeout(() => resolve(undefined), ms));
}

/** Thin wrapper so the hook keeps passing a bare function reference. */
function fingerprintOf(dirPath: string): string {
  try {
    return computeWorkspaceFingerprint(readDirectoryNative, dirPath);
  } catch (_) {
    return "";
  }
}

export function useWorkspaceAutoRefresh(
  workspaceId: string | undefined,
  onRefreshed: (ws: Workspace) => void,
  /** While true (e.g. sidebar resize drag) disk checks are skipped outright. */
  paused?: boolean
) {
  const idRef = useRef(workspaceId);
  idRef.current = workspaceId;
  const cbRef = useRef(onRefreshed);
  cbRef.current = onRefreshed;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const queuedRef = useRef(false);
  const seqRef = useRef(0);
  const mountedRef = useRef(true);
  const lastFingerprintRef = useRef<string>("");
  const dirPathRef = useRef<string>("");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!workspaceId) return;

    let pollInterval: ReturnType<typeof setInterval> | null = null;

    getWorkspaceDirPath(workspaceId).then((p) => {
      dirPathRef.current = p;
      try {
        lastFingerprintRef.current = fingerprintOf(p);
      } catch (_) {}
    });

    const run = async () => {
      if (inFlightRef.current) {
        queuedRef.current = true;
        return;
      }
      inFlightRef.current = true;
      const mySeq = ++seqRef.current;
      try {
        // Shallow reload: open folders re-fetch themselves (FileExplorer),
        // so a disk change never triggers a deep-tree freeze.
        const updated = await Promise.race([
          loadWorkspaceShallow(workspaceId),
          timeout<Workspace>(LOAD_TIMEOUT_MS),
        ]);
        if (updated && mountedRef.current && mySeq === seqRef.current && idRef.current === workspaceId) {
          cbRef.current(updated);
        }
      } catch (_) {}
      inFlightRef.current = false;
      if (queuedRef.current) {
        queuedRef.current = false;
        schedule();
      }
    };

    const schedule = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(run, DEBOUNCE_MS);
    };

    // 1. Programmatic notifications (UI creates, deletes, renames)
    const unsubChanges = subscribeWorkspaceChanges((changedWsId) => {
      if (!changedWsId || !idRef.current || changedWsId === idRef.current) schedule();
    });

    // 2. Periodic disk check: detects external writes, agents, terminal processes, git.
    // Chunked async walk — yields to the JS thread so resize animation
    // frames and taps interleave; never overlapping; backed off on slow
    // trees; skipped entirely while paused (sidebar drag) or backgrounded.
    const fpInFlightRef = { current: false };
    const pollMsRef = { current: POLL_INTERVAL_MS };
    const checkDiskChanges = () => {
      if (
        !dirPathRef.current ||
        inFlightRef.current ||
        fpInFlightRef.current ||
        pausedRef.current ||
        watcherPausedExternal ||
        AppState.currentState !== "active"
      )
        return;
      fpInFlightRef.current = true;
      const stats: FingerprintStats = { dirCount: 0, durationMs: 0 };
      computeWorkspaceFingerprintAsync(readDirectoryNative, dirPathRef.current, undefined, 25, stats)
        .then((currentFp) => {
          fpInFlightRef.current = false;
          // Adaptive poll: slow trees check less often.
          const next =
            stats.durationMs >= VERYSLOW_FP_MS
              ? POLL_INTERVAL_VERYSLOW_MS
              : stats.durationMs >= SLOW_FP_MS
                ? POLL_INTERVAL_SLOW_MS
                : POLL_INTERVAL_MS;
          if (next !== pollMsRef.current) {
            pollMsRef.current = next;
            if (pollInterval) clearInterval(pollInterval);
            pollInterval = setInterval(checkDiskChanges, next);
          }
          if (currentFp && currentFp !== lastFingerprintRef.current) {
            lastFingerprintRef.current = currentFp;
            schedule();
          }
        })
        .catch(() => {
          fpInFlightRef.current = false;
        });
    };

    pollInterval = setInterval(checkDiskChanges, POLL_INTERVAL_MS);

    // 3. App resume check: refreshes immediately when coming back from background
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") checkDiskChanges();
    });

    return () => {
      unsubChanges();
      if (pollInterval) clearInterval(pollInterval);
      appStateSub.remove();
      if (timerRef.current) clearTimeout(timerRef.current);
      seqRef.current++;
    };
  }, [workspaceId]);
}
