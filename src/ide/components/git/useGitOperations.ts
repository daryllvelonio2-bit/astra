import { useState, useCallback, useEffect } from "react";
import { Linking } from "react-native";
import {
  GitBranch,
  GitCommit,
  GitCommitFile,
  GitFileStatus,
  GitRepoStatus,
} from "./types";
import {
  getGitStatus,
  getGitFileDiff,
  stageGitFile,
  unstageGitFile,
  stageAllGitFiles,
  unstageAllGitFiles,
  commitGitChanges,
  getGitCommitHistory,
  getGitCommitFiles,
  getGitCommitDiff,
  getGitBranches,
  switchGitBranch,
  createGitBranch,
  fetchGitRemote,
  pullGitRemote,
  pushGitRemote,
  initGitRepo,
  getGitRemoteUrl,
  setGitRemoteUrl,
} from "../../services/gitService";
import {
  amendCommit,
  resetToCommit,
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
import { useCommitAvatars } from "./useCommitAvatars";
import { isGitAuthError } from "../../services/gitCloneService";
import { showAppDialog } from "../../services/appDialog";
import { parseSyncOutput, hasSyncContent, showSyncReportDialog } from "../../services/gitSyncReport";

export function useGitOperations(
  workspaceId: string | undefined,
  visible: boolean,
  isLandscape: boolean
) {
  const [activeTab, setActiveTab] = useState<"changes" | "history">("changes");
  const [status, setStatus] = useState<GitRepoStatus | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<GitFileStatus | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<GitCommit | null>(null);
  const [commitFiles, setCommitFiles] = useState<GitCommitFile[]>([]);
  const [selectedCommitFile, setSelectedCommitFile] = useState<GitCommitFile | null>(null);
  const [diffText, setDiffText] = useState<string>("");

  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [loadingCommitFiles, setLoadingCommitFiles] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [showBranchModal, setShowBranchModal] = useState(false);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [showRemoteModal, setShowRemoteModal] = useState(false);
  const [portraitShowDetail, setPortraitShowDetail] = useState(false);

  // Commit actions (long-press on a history row)
  const [commitActionTarget, setCommitActionTarget] = useState<GitCommit | null>(null);
  const [commitActionAnchor, setCommitActionAnchor] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showCommitActions, setShowCommitActions] = useState(false);
  const [commitActionBusy, setCommitActionBusy] = useState(false);

  // Avatar store lives here (stays mounted) so History never refetches.
  const { avatars, brokenAvatars, markBroken } = useCommitAvatars(remoteUrl);
  const setStableRemoteUrl = (url: string | null) =>
    setRemoteUrl((prev) => (prev === (url ?? null) ? prev : (url ?? null)));

  const refreshGitState = useCallback(async () => {
    if (!visible) return;
    setLoadingStatus(true);
    const newStatus = await getGitStatus(workspaceId);
    setStatus(newStatus);
    setLoadingStatus(false);
    if (newStatus.isRepo) {
      getGitCommitHistory(workspaceId).then(setCommits);
      getGitBranches(workspaceId).then(setBranches);
      getGitRemoteUrl(workspaceId).then(setStableRemoteUrl);
    }
  }, [workspaceId, visible]);

  useEffect(() => {
    if (visible) refreshGitState();
  }, [visible, refreshGitState]);

  const loadFileDiff = async (file: GitFileStatus) => {
    setSelectedFile(file);
    setSelectedCommit(null);
    setCommitFiles([]);
    setSelectedCommitFile(null);
    setLoadingDiff(true);
    if (!isLandscape) setPortraitShowDetail(true);
    const diff = await getGitFileDiff(workspaceId, file.path, file.staged);
    setDiffText(diff);
    setLoadingDiff(false);
  };

  const loadCommitDiff = async (commit: GitCommit) => {
    setSelectedCommit(commit);
    setSelectedFile(null);
    setLoadingCommitFiles(true);
    const files = await getGitCommitFiles(workspaceId, commit.hash);
    setCommitFiles(files);
    setLoadingCommitFiles(false);
    const initialFile = files[0] || null;
    setSelectedCommitFile(initialFile);
    setLoadingDiff(true);
    const diff = await getGitCommitDiff(workspaceId, commit.hash, initialFile?.path);
    setDiffText(diff);
    setLoadingDiff(false);
  };

  const handleSelectCommitFile = async (file: GitCommitFile) => {
    if (!selectedCommit) return;
    setSelectedCommitFile(file);
    setLoadingDiff(true);
    if (!isLandscape) setPortraitShowDetail(true);
    const diff = await getGitCommitDiff(workspaceId, selectedCommit.hash, file.path);
    setDiffText(diff);
    setLoadingDiff(false);
  };

  const handleBackToCommits = () => {
    setSelectedCommit(null);
    setSelectedCommitFile(null);
    setCommitFiles([]);
    setDiffText("");
    if (!isLandscape) setPortraitShowDetail(false);
  };

  const handleToggleStageFile = async (file: GitFileStatus) => {
    if (file.staged) {
      await unstageGitFile(workspaceId, file.path);
    } else {
      await stageGitFile(workspaceId, file.path);
    }
    refreshGitState();
  };

  const handleToggleStageAll = async (stageAll: boolean) => {
    if (stageAll) {
      await stageAllGitFiles(workspaceId);
    } else {
      await unstageAllGitFiles(workspaceId);
    }
    refreshGitState();
  };

  const handleCommit = async (summary: string, description: string) => {
    setCommitting(true);
    const res = await commitGitChanges(workspaceId, summary, description);
    setCommitting(false);
    if (res.success) {
      setSelectedFile(null);
      setDiffText("");
      if (!isLandscape) setPortraitShowDetail(false);
      refreshGitState();
    } else {
      showAppDialog({ title: "Commit Failed", message: res.error || "Could not commit changes." });
    }
  };

  const handleCommitAndPush = async (summary: string, description: string) => {
    setCommitting(true);
    const res = await commitGitChanges(workspaceId, summary, description);
    if (!res.success) {
      setCommitting(false);
      showAppDialog({ title: "Commit Failed", message: res.error || "Could not commit changes." });
      return;
    }
    setSelectedFile(null);
    setDiffText("");
    if (!isLandscape) setPortraitShowDetail(false);

    if (!remoteUrl) {
      setCommitting(false);
      refreshGitState();
      showAppDialog({ title: "Committed Locally", message: "Your commit was created, but no remote repository is configured. Would you like to publish this repository now?", buttons: [
          { text: "Later", style: "cancel" },
          { text: "Publish to GitHub", onPress: () => setShowRemoteModal(true) },
        ] });
      return;
    }

    const pushRes = await pushGitRemote(workspaceId, status?.currentBranch);
    setCommitting(false);
    refreshGitState();
    showAppDialog({ title: pushRes.success ? "Success" : "Pushed with notice", message: pushRes.success ? "Committed and pushed changes to remote!" : pushRes.message });
  };

  const handleSaveRemote = async (url: string): Promise<{ success: boolean; error?: string }> => {
    const res = await setGitRemoteUrl(workspaceId, url);
    if (res.success) {
      setStableRemoteUrl(url.trim() ? url.trim() : null);
      refreshGitState();
    }
    return res;
  };

  // Successes render as a structured report card (refs / commits / files /
  // stat); failures and auth issues stay as themed dialogs.
  const reportSyncResult = (
    kind: "fetch" | "pull" | "push",
    res: { success: boolean; message: string }
  ) => {
    const title = kind === "fetch" ? "Fetch" : kind === "pull" ? "Pull" : "Push";
    if (isGitAuthError(res.message)) {
      return showAppDialog({
        title: `${title} Needs Authentication`,
        message: `${res.message}\n\nAdd your GitHub credentials to continue.`,
        buttons: [
          { text: "Later", style: "cancel" },
          { text: "Add Credentials", onPress: () => setShowCredentialsModal(true) },
        ],
      });
    }
    if (!res.success) return showAppDialog({ title: `${title} failed`, message: res.message });
    const rep = parseSyncOutput(kind, res.message, status?.currentBranch || null);
    if (!hasSyncContent(rep)) {
      return showAppDialog({ title, message: kind === "push" ? "Everything up to date." : "Already up to date." });
    }
    showSyncReportDialog(rep, kind === "pull" || kind === "fetch" ? () => setActiveTab("history") : undefined);
  };

  const handlePush = async () => {
    if (!status?.isRepo) return;
    if (!remoteUrl) return setShowRemoteModal(true);
    if (status.detached) {
      return showAppDialog({ title: "Detached HEAD", message: "Switch to a local branch before pushing." });
    }
    setSyncing(true);
    const res = await pushGitRemote(workspaceId, status.currentBranch);
    setSyncing(false);
    refreshGitState();
    reportSyncResult("push", res);
  };

  /** Explicit header actions — one button per operation, no smart guess. */
  const handleFetch = async () => {
    if (!status?.isRepo || !remoteUrl) return setShowRemoteModal(true);
    setSyncing(true);
    const res = await fetchGitRemote(workspaceId);
    setSyncing(false);
    refreshGitState();
    reportSyncResult("fetch", res);
  };

  const handlePull = async () => {
    if (!status?.isRepo || !remoteUrl) return setShowRemoteModal(true);
    setSyncing(true);
    const res = await pullGitRemote(workspaceId, status.currentBranch);
    setSyncing(false);
    refreshGitState();
    reportSyncResult("pull", res);
  };

  const handleSwitchBranch = async (branchName: string) => {
    const res = await switchGitBranch(workspaceId, branchName);
    if (!res.success) {
      showAppDialog({ title: "Error", message: res.error || "Could not switch branch." });
      return;
    }
    refreshGitState();
    if (!remoteUrl) return;
    try {
      await fetchGitRemote(workspaceId);
    } catch (_) {}
    refreshGitState();
  };

  const handleCreateBranch = async (branchName: string) => {
    const res = await createGitBranch(workspaceId, branchName);
    if (res.success) refreshGitState();
    else showAppDialog({ title: "Error", message: res.error || "Could not create branch." });
  };

  const handleInitRepo = async () => {
    const ok = await initGitRepo(workspaceId);
    if (ok) refreshGitState();
    else showAppDialog({ title: "Error", message: "Could not initialize Git repository." });
  };

  // ----- Commit actions (long-press menu) -----------------------------------

  const openCommitActions = (commit: GitCommit, position: { x: number; y: number }) => {
    setCommitActionTarget(commit);
    setCommitActionAnchor(position);
    setShowCommitActions(true);
  };

  const closeCommitActions = () => {
    setShowCommitActions(false);
    setCommitActionBusy(false);
  };

  // Destructive resets need a confirm first; everything else runs directly.
  const runCommitOp = async (
    commit: GitCommit,
    op: () => Promise<GitOpResult>,
    successMsg: string
  ) => {
    setCommitActionBusy(true);
    const res = await op();
    setCommitActionBusy(false);
    if (res.success) {
      closeCommitActions();
      handleBackToCommits();
      refreshGitState();
      if (successMsg) showAppDialog({ title: "Success", message: successMsg });
    } else {
      showAppDialog({ title: "Git Error", message: res.error || "The command failed." });
    }
  };

  const confirmDangerous = (title: string, body: string, run: () => void) =>
    showAppDialog({ title: title, message: body, buttons: [
      { text: "Cancel", style: "cancel" },
      { text: "Confirm", style: "destructive", onPress: run },
    ] });

  const handleAmend = (message: string) => {
    if (!commitActionTarget) return;
    const commit = commitActionTarget;
    runCommitOp(commit, () => amendCommit(workspaceId, message), "Commit amended.");
  };

  const handleResetToCommit = (mode: ResetMode) => {
    if (!commitActionTarget) return;
    const commit = commitActionTarget;
    const run = () =>
      runCommitOp(commit, () => resetToCommit(workspaceId, commit.hash, mode), "");
    if (mode === "hard") {
      confirmDangerous(
        "Hard Reset",
        `Discard all commits after ${commit.shortHash} and all uncommitted changes? This cannot be undone.`,
        run
      );
    } else {
      run();
    }
  };

  const handleCheckoutCommit = () => {
    if (!commitActionTarget) return;
    const commit = commitActionTarget;
    runCommitOp(
      commit,
      () => checkoutCommit(workspaceId, commit.hash),
      `Checked out ${commit.shortHash} (detached HEAD).`
    );
  };

  const handleRevertCommit = () => {
    if (!commitActionTarget) return;
    const commit = commitActionTarget;
    runCommitOp(
      commit,
      () => revertCommit(workspaceId, commit.hash),
      `Reverted ${commit.shortHash}.`
    );
  };

  const handleCherryPickCommit = () => {
    if (!commitActionTarget) return;
    const commit = commitActionTarget;
    runCommitOp(
      commit,
      () => cherryPickCommit(workspaceId, commit.hash),
      `Cherry-picked ${commit.shortHash}.`
    );
  };

  const handleCreateBranchFromCommit = (name: string) => {
    if (!commitActionTarget) return;
    const commit = commitActionTarget;
    runCommitOp(
      commit,
      () => createBranchFromCommit(workspaceId, name, commit.hash),
      `Created and switched to ${name}.`
    );
  };

  const handleCreateTag = (name: string) => {
    if (!commitActionTarget) return;
    const commit = commitActionTarget;
    runCommitOp(
      commit,
      () => createTag(workspaceId, name, commit.hash),
      `Tagged ${commit.shortHash} as ${name}.`
    );
  };

  const handleCopyCommitSha = async () => {
    if (!commitActionTarget) return;
    await Clipboard.setStringAsync(commitActionTarget.hash);
  };

  const handleViewCommitOnGitHub = async () => {
    if (!commitActionTarget) return;
    const url = buildCommitWebUrl(remoteUrl, commitActionTarget.hash);
    if (!url) return showAppDialog({ title: "Not on GitHub", message: "This repository has no GitHub remote." });
    try {
      await Linking.openURL(url);
    } catch (_) {
      showAppDialog({ title: "Error", message: "Could not open the browser." });
    }
  };

  // Amend wants the real multi-line message, not the truncated list title.
  const [amendInitialMessage, setAmendInitialMessage] = useState("");
  useEffect(() => {
    if (showCommitActions && commitActionTarget) {
      getCommitMessage(workspaceId, commitActionTarget.hash).then(setAmendInitialMessage);
    }
  }, [showCommitActions, commitActionTarget, workspaceId]);

  return {
    activeTab,
    setActiveTab,
    status,
    commits,
    branches,
    remoteUrl,
    selectedFile,
    setSelectedFile,
    selectedCommit,
    commitFiles,
    selectedCommitFile,
    diffText,
    loadingStatus,
    loadingDiff,
    loadingCommitFiles,
    committing,
    syncing,
    showBranchModal,
    setShowBranchModal,
    showCredentialsModal,
    setShowCredentialsModal,
    showRemoteModal,
    setShowRemoteModal,
    showCommitActions,
    commitActionTarget,
    commitActionAnchor,
    commitActionBusy,
    amendInitialMessage,
    openCommitActions,
    closeCommitActions,
    handleAmend,
    handleResetToCommit,
    handleCheckoutCommit,
    handleRevertCommit,
    handleCherryPickCommit,
    handleCreateBranchFromCommit,
    handleCreateTag,
    handleCopyCommitSha,
    handleViewCommitOnGitHub,
    portraitShowDetail,
    setPortraitShowDetail,
    avatars,
    brokenAvatars,
    markBroken,
    refreshGitState,
    loadFileDiff,
    loadCommitDiff,
    handleSelectCommitFile,
    handleBackToCommits,
    handleToggleStageFile,
    handleToggleStageAll,
    handleCommit,
    handleCommitAndPush,
    handleSaveRemote,
    handlePush,
    handleFetch,
    handlePull,
    handleSwitchBranch,
    handleCreateBranch,
    handleInitRepo,
  };
}
