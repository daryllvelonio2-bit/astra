import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import {
  loadWorkspace,
  subscribeWorkspaceChanges,
  getWorkspaceDirPath,
  Workspace,
} from "../services/workspaceService";
import { readDirectoryNative } from "../services/nativeFs";
import { computeWorkspaceFingerprint } from "../services/workspaceWatcherService";

const DEBOUNCE_MS = 600;
const POLL_INTERVAL_MS = 2500;
const LOAD_TIMEOUT_MS = 30000;

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
  onRefreshed: (ws: Workspace) => void
) {
  const idRef = useRef(workspaceId);
  idRef.current = workspaceId;
  const cbRef = useRef(onRefreshed);
  cbRef.current = onRefreshed;

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
        const updated = await Promise.race([
          loadWorkspace(workspaceId),
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

    // 2. Periodic disk check: detects external writes, agents, terminal processes, git
    const checkDiskChanges = () => {
      if (!dirPathRef.current || inFlightRef.current || AppState.currentState !== "active") return;
      try {
        const currentFp = fingerprintOf(dirPathRef.current);
        if (currentFp && currentFp !== lastFingerprintRef.current) {
          lastFingerprintRef.current = currentFp;
          schedule();
        }
      } catch (_) {}
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
