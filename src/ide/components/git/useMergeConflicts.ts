import { useState, useEffect, useCallback, useMemo } from "react";
import { showAppDialog } from "../../services/appDialog";
import { ideActionService } from "../../services/ideActionService";
import {
  getMergeState,
  resolveConflictFile,
  abortMerge,
  completeMerge,
  type MergeState,
} from "../../services/gitConflictService";
import type { GitFileStatus } from "./types";

interface UseMergeConflictsArgs {
  workspaceId: string | undefined;
  /** Status file list — a new array identity means git state just refreshed, so re-check the merge. */
  files: GitFileStatus[];
  refreshGitState: () => void | Promise<void>;
}

/**
 * Merge-conflict ownership for the Git tab: watches for MERGE_HEAD whenever
 * git status refreshes and serves resolve/abort/complete + open-in-editor.
 * Separate hook (one feature = one file) so useGitOperations stays untouched.
 */
export function useMergeConflicts({ workspaceId, files, refreshGitState }: UseMergeConflictsArgs) {
  const [mergeState, setMergeState] = useState<MergeState>({ merging: false, files: [] });
  const [busy, setBusy] = useState(false);

  const refreshMergeState = useCallback(async (): Promise<MergeState> => {
    const st = await getMergeState(workspaceId);
    setMergeState(st);
    return st;
  }, [workspaceId]);

  // Re-check whenever git state refreshes (pull / stage / commit swap `files`).
  useEffect(() => {
    let cancelled = false;
    getMergeState(workspaceId).then((st) => {
      if (!cancelled) setMergeState(st);
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, files]);

  const conflictedSet = useMemo(() => new Set(mergeState.files.map((f) => f.path)), [mergeState]);

  const markerLineFor = useCallback(
    (path: string): number => mergeState.files.find((f) => f.path === path)?.markerLine || 0,
    [mergeState]
  );

  const runOp = useCallback(
    async (label: string, fn: () => Promise<{ success: boolean; message: string }>, silent = false) => {
      if (busy) return;
      setBusy(true);
      try {
        const res = await fn();
        await refreshGitState();
        await refreshMergeState();
        if (!res.success || (!silent && res.message)) {
          showAppDialog({ title: res.success ? "Merge" : label, message: res.message });
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, refreshGitState, refreshMergeState]
  );

  const resolveWith = useCallback(
    (path: string, side: "ours" | "theirs") =>
      runOp("Resolve conflict", () => resolveConflictFile(workspaceId, path, side), true),
    [runOp, workspaceId]
  );

  const abortMergeOp = useCallback(() => {
    showAppDialog({
      title: "Abort merge?",
      message: "This restores everything to before the merge. Resolved files lose their resolutions.",
      buttons: [
        { text: "Cancel", style: "cancel" },
        { text: "Abort merge", style: "destructive", onPress: () => runOp("Abort merge", () => abortMerge(workspaceId)) },
      ],
    });
  }, [runOp, workspaceId]);

  const completeMergeOp = useCallback(() => {
    if (mergeState.files.length > 0) {
      showAppDialog({
        title: "Still conflicted",
        message: `${mergeState.files.length} file(s) still need resolving — long-press each one and pick a side, or edit the markers.`,
      });
      return;
    }
    runOp("Complete merge", () => completeMerge(workspaceId));
  }, [runOp, workspaceId, mergeState]);

  /** Open a conflicted file in the editor, jumping to its first `<<<<<<<` marker. */
  const openInEditor = useCallback(
    (path: string) => {
      const line = markerLineFor(path);
      ideActionService.openFile(path, line > 0 ? line : undefined, workspaceId, true);
    },
    [markerLineFor, workspaceId]
  );

  return {
    mergeState,
    conflictedSet,
    mergeBusy: busy,
    refreshMergeState,
    resolveWith,
    abortMergeOp,
    completeMergeOp,
    openInEditor,
  };
}
