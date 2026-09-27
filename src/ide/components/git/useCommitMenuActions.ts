import { useState, useCallback, useEffect } from "react";
import { Linking } from "react-native";
import type { GitCommit } from "./types";
import {
  amendCommit,
  resetToCommit,
  uncommitLatest,
  checkoutCommit,
  revertCommit,
  cherryPickCommit,
  createBranchFromCommit,
  createTag,
  getCommitMessage,
  buildCommitWebUrl,
  ResetMode,
  GitOpResult,
} from "../../services/gitCommitActions";
import { Clipboard } from "../../services/clipboardService";
import { showAppDialog } from "../../services/appDialog";

interface UseCommitMenuActionsArgs {
  workspaceId: string | undefined;
  remoteUrl: string | null | undefined;
  commits: GitCommit[];
  refreshGitState: () => void | Promise<void>;
  handleBackToCommits: () => void;
  setActiveTab: (tab: "changes" | "history") => void;
  onRestoreCommitMessage?: (msg: string) => void;
  onSyncWorkspace?: () => void | Promise<void>;
}

export function useCommitMenuActions({
  workspaceId,
  remoteUrl,
  commits,
  refreshGitState,
  handleBackToCommits,
  setActiveTab,
  onRestoreCommitMessage,
  onSyncWorkspace,
}: UseCommitMenuActionsArgs) {
  const [showCommitActions, setShowCommitActions] = useState(false);
  const [commitActionTarget, setCommitActionTarget] = useState<GitCommit | null>(null);
  const [commitActionAnchor, setCommitActionAnchor] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [commitActionBusy, setCommitActionBusy] = useState(false);
  const [amendInitialMessage, setAmendInitialMessage] = useState("");

  const isHeadCommit = Boolean(
    commitActionTarget && commits.length > 0 && commits[0].hash === commitActionTarget.hash
  );

  const openCommitActions = useCallback((commit: GitCommit, position: { x: number; y: number }) => {
    setCommitActionTarget(commit);
    setCommitActionAnchor(position);
    setShowCommitActions(true);
  }, []);

  const closeCommitActions = useCallback(() => {
    setShowCommitActions(false);
    setCommitActionBusy(false);
  }, []);

  useEffect(() => {
    if (showCommitActions && commitActionTarget) {
      getCommitMessage(workspaceId, commitActionTarget.hash).then(setAmendInitialMessage);
    }
  }, [showCommitActions, commitActionTarget, workspaceId]);

  const runCommitOp = async (
    commit: GitCommit,
    op: () => Promise<GitOpResult & { uncommitted?: boolean; message?: string }>,
    successMsg?: string
  ) => {
    setCommitActionBusy(true);
    const res = await op();
    setCommitActionBusy(false);
    if (res.success) {
      closeCommitActions();
      handleBackToCommits();
      await refreshGitState();
      await onSyncWorkspace?.();
      if (res.uncommitted) {
        setActiveTab("changes");
        if (res.message && onRestoreCommitMessage) {
          onRestoreCommitMessage(res.message);
        }
      }
      if (successMsg) {
        showAppDialog({ title: "Success", message: successMsg });
      }
    } else {
      showAppDialog({ title: "Git Error", message: res.error || "The command failed." });
    }
  };

  const confirmDangerous = (title: string, body: string, run: () => void) =>
    showAppDialog({
      title,
      message: body,
      buttons: [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", style: "destructive", onPress: run },
      ],
    });

  const handleAmend = useCallback(
    (message: string) => {
      if (!commitActionTarget) return;
      runCommitOp(commitActionTarget, () => amendCommit(workspaceId, message), "Commit amended.");
    },
    [commitActionTarget, workspaceId]
  );

  const handleResetToCommit = useCallback(
    (mode: ResetMode) => {
      if (!commitActionTarget) return;
      const commit = commitActionTarget;
      const isHead = commits.length > 0 && commits[0].hash === commit.hash;

      const run = () =>
        runCommitOp(
          commit,
          () => resetToCommit(workspaceId, commit.hash, mode, isHead),
          isHead
            ? (mode === "hard"
                ? `Commit #${commit.shortHash} and all changes discarded.`
                : `Commit #${commit.shortHash} undone. Changes returned to the Changes tab.`)
            : (mode === "hard"
                ? `Branch and files reset to #${commit.shortHash}. Later changes discarded.`
                : `Branch reset to #${commit.shortHash}. Later changes returned to the Changes tab.`)
        );

      if (mode === "hard") {
        confirmDangerous(
          "Hard Reset",
          isHead
            ? `Discard commit #${commit.shortHash} and all its changes? This cannot be undone.`
            : `Discard all commits after #${commit.shortHash} and revert files to that commit? This cannot be undone.`,
          run
        );
      } else {
        run();
      }
    },
    [commitActionTarget, commits, workspaceId]
  );

  const handleUndoLatestCommit = useCallback(
    async (mode: ResetMode = "mixed") => {
      setCommitActionBusy(true);
      const res = await uncommitLatest(workspaceId, mode);
      setCommitActionBusy(false);
      closeCommitActions();
      handleBackToCommits();
      await refreshGitState();
      await onSyncWorkspace?.();
      if (res.success) {
        setActiveTab("changes");
        if (res.message && onRestoreCommitMessage) {
          onRestoreCommitMessage(res.message);
        }
        showAppDialog({
          title: "Commit Undone",
          message: "The commit has been undone and its files returned to the Changes tab.",
        });
      } else {
        showAppDialog({ title: "Git Error", message: res.error || "Failed to undo commit." });
      }
    },
    [workspaceId, closeCommitActions, handleBackToCommits, refreshGitState, setActiveTab, onRestoreCommitMessage]
  );

  const handleCheckoutCommit = useCallback(() => {
    if (!commitActionTarget) return;
    const commit = commitActionTarget;
    runCommitOp(
      commit,
      () => checkoutCommit(workspaceId, commit.hash),
      `Checked out ${commit.shortHash} (detached HEAD).`
    );
  }, [commitActionTarget, workspaceId]);

  const handleRevertCommit = useCallback(() => {
    if (!commitActionTarget) return;
    const commit = commitActionTarget;
    runCommitOp(
      commit,
      () => revertCommit(workspaceId, commit.hash),
      `Reverted ${commit.shortHash} (created revert commit).`
    );
  }, [commitActionTarget, workspaceId]);

  const handleCherryPickCommit = useCallback(() => {
    if (!commitActionTarget) return;
    const commit = commitActionTarget;
    runCommitOp(
      commit,
      () => cherryPickCommit(workspaceId, commit.hash),
      `Cherry-picked ${commit.shortHash}.`
    );
  }, [commitActionTarget, workspaceId]);

  const handleCreateBranchFromCommit = useCallback(
    (name: string) => {
      if (!commitActionTarget) return;
      const commit = commitActionTarget;
      runCommitOp(
        commit,
        () => createBranchFromCommit(workspaceId, name, commit.hash),
        `Created and switched to ${name}.`
      );
    },
    [commitActionTarget, workspaceId]
  );

  const handleCreateTag = useCallback(
    (name: string) => {
      if (!commitActionTarget) return;
      const commit = commitActionTarget;
      runCommitOp(
        commit,
        () => createTag(workspaceId, name, commit.hash),
        `Tagged ${commit.shortHash} as ${name}.`
      );
    },
    [commitActionTarget, workspaceId]
  );

  const handleCopyCommitSha = useCallback(async () => {
    if (!commitActionTarget) return;
    await Clipboard.setStringAsync(commitActionTarget.hash);
  }, [commitActionTarget]);

  const handleViewCommitOnGitHub = useCallback(async () => {
    if (!commitActionTarget) return;
    const url = buildCommitWebUrl(remoteUrl ?? null, commitActionTarget.hash);
    if (!url) return showAppDialog({ title: "Not on GitHub", message: "This repository has no GitHub remote." });
    try {
      await Linking.openURL(url);
    } catch (_) {
      showAppDialog({ title: "Error", message: "Could not open the browser." });
    }
  }, [commitActionTarget, remoteUrl]);

  return {
    showCommitActions,
    commitActionTarget,
    commitActionAnchor,
    commitActionBusy,
    amendInitialMessage,
    isHeadCommit,
    openCommitActions,
    closeCommitActions,
    handleAmend,
    handleResetToCommit,
    handleUndoLatestCommit,
    handleCheckoutCommit,
    handleRevertCommit,
    handleCherryPickCommit,
    handleCreateBranchFromCommit,
    handleCreateTag,
    handleCopyCommitSha,
    handleViewCommitOnGitHub,
  };
}
