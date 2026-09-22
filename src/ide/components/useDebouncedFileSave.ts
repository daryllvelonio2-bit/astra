import { useRef, useEffect, useCallback } from "react";
import { saveFileContent } from "../services/workspaceService";

/**
 * Manages debounced disk writes for active file editing.
 * Trailing debounce (default 700ms) eliminates per-keystroke I/O,
 * with immediate flush available on file switch, run, or unmount.
 */
export function useDebouncedFileSave(workspaceId?: string) {
  const pendingRef = useRef<{ filePath: string; content: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (!workspaceId || !pendingRef.current) return;
    const { filePath, content } = pendingRef.current;
    pendingRef.current = null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    try {
      await saveFileContent(workspaceId, filePath, content);
    } catch (_) {}
  }, [workspaceId]);

  const scheduleSave = useCallback(
    (filePath: string, content: string, delayMs = 700) => {
      if (!workspaceId || !filePath) return;
      pendingRef.current = { filePath, content };
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(async () => {
        timerRef.current = null;
        if (pendingRef.current) {
          const toSave = pendingRef.current;
          pendingRef.current = null;
          try {
            await saveFileContent(workspaceId, toSave.filePath, toSave.content);
          } catch (_) {}
        }
      }, delayMs);
    },
    [workspaceId]
  );

  // Auto-flush on unmount or workspace switch so no pending edits are lost
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (pendingRef.current && workspaceId) {
        const { filePath, content } = pendingRef.current;
        pendingRef.current = null;
        saveFileContent(workspaceId, filePath, content).catch(() => {});
      }
    };
  }, [workspaceId]);

  return { scheduleSave, flush };
}
