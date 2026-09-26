import { useState, useEffect, useCallback, useMemo } from "react";
import { showAppDialog } from "../../services/appDialog";
import {
  listStashes,
  saveStash,
  applyStash,
  popStash,
  dropStash,
  type StashEntry,
} from "../../services/gitStashService";
import {
  getRebaseState,
  startRebase,
  continueRebase,
  skipRebase,
  abortRebase,
  type RebaseState,
} from "../../services/gitRebaseService";
import type { GitFileStatus } from "./types";

interface UseStashRebaseArgs {
  workspaceId: string | undefined;
  /** Status file list — a new array identity means git state just refreshed, so re-check stash + rebase. */
  files: GitFileStatus[];
  refreshGitState: () => void | Promise<void>;
}

/**
 * Stash + rebase ownership for the Git tab: re-checked whenever git status
 * refreshes, mirroring useMergeConflicts. Separate hook (one feature = one
 * file) so useGitOperations (at the 500-line cap) stays untouched.
 */
export function useStashRebase({ workspaceId, files, refreshGitState }: UseStashRebaseArgs) {
  const [stashes, setStashes] = useState<StashEntry[]>([]);
  const [rebase, setRebase] = useState<RebaseState>({ rebasing: false, conflicted: [] });
  const [busy, setBusy] = useState(false);

  const refreshStashRebase = useCallback(async () => {
    const [s, r] = await Promise.all([listStashes(workspaceId), getRebaseState(workspaceId)]);
    setStashes(s);
    setRebase(r);
  }, [workspaceId]);

  // Re-check whenever git state refreshes (pull / stage / commit swap `files`).
  // `files` is identity-only: its presence here re-runs the check, nothing reads it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, r] = await Promise.all([listStashes(workspaceId), getRebaseState(workspaceId)]);
        if (!cancelled) {
          setStashes(s);
          setRebase(r);
        }
      } catch (_) {}
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, files]);

  /** Rebase-conflicted paths — the view unions this with the merge set for badges. */
  const rebaseConflictedSet = useMemo(() => new Set(rebase.conflicted), [rebase]);

  const runOp = useCallback(
    async (
      label: string,
      fn: () => Promise<{ success: boolean; message: string }>,
      silentSuccess = false
    ) => {
      if (busy) return;
      setBusy(true);
      try {
        const res = await fn();
        await refreshGitState();
        await refreshStashRebase();
        if (!res.success) {
          showAppDialog({ title: label, message: res.message });
        } else if (!silentSuccess && res.message) {
          showAppDialog({ title: label, message: res.message });
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, refreshGitState, refreshStashRebase]
  );

  const saveStashOp = useCallback(
    (message: string, includeUntracked: boolean) =>
      runOp("Stash", () => saveStash(workspaceId, message, includeUntracked), true),
    [runOp, workspaceId]
  );

  const applyStashOp = useCallback(
    (ref: string) => runOp("Apply stash", () => applyStash(workspaceId, ref), true),
    [runOp, workspaceId]
  );

  const popStashOp = useCallback(
    (ref: string) => runOp("Pop stash", () => popStash(workspaceId, ref), true),
    [runOp, workspaceId]
  );

  const dropStashOp = useCallback(
    (ref: string) => {
      showAppDialog({
        title: "Drop stash?",
        message: "This permanently deletes the stashed changes. This cannot be undone.",
        buttons: [
          { text: "Cancel", style: "cancel" },
          { text: "Drop", style: "destructive", onPress: () => runOp("Drop stash", () => dropStash(workspaceId, ref), true) },
        ],
      });
    },
    [runOp, workspaceId]
  );

  const startRebaseOp = useCallback(
    (target: string) => runOp("Rebase", () => startRebase(workspaceId, target), true),
    [runOp, workspaceId]
  );

  const continueRebaseOp = useCallback(
    () => runOp("Continue rebase", () => continueRebase(workspaceId)),
    [runOp, workspaceId]
  );

  const skipRebaseOp = useCallback(
    () => runOp("Skip commit", () => skipRebase(workspaceId), true),
    [runOp, workspaceId]
  );

  const abortRebaseOp = useCallback(() => {
    showAppDialog({
      title: "Abort rebase?",
      message: "This restores everything to before the rebase. Resolved files lose their resolutions.",
      buttons: [
        { text: "Cancel", style: "cancel" },
        { text: "Abort rebase", style: "destructive", onPress: () => runOp("Abort rebase", () => abortRebase(workspaceId), true) },
      ],
    });
  }, [runOp, workspaceId]);

  return {
    stashes,
    rebase,
    rebaseConflictedSet,
    stashRebaseBusy: busy,
    refreshStashRebase,
    saveStashOp,
    applyStashOp,
    popStashOp,
    dropStashOp,
    startRebaseOp,
    continueRebaseOp,
    skipRebaseOp,
    abortRebaseOp,
  };
}
