import { useState, useCallback, useEffect } from "react";
import { Alert } from "react-native";
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
import { useCommitAvatars } from "./useCommitAvatars";
import { isGitAuthError } from "../../services/gitCloneService";

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
      Alert.alert("Commit Failed", res.error || "Could not commit changes.");
    }
  };

  const handleCommitAndPush = async (summary: string, description: string) => {
    setCommitting(true);
    const res = await commitGitChanges(workspaceId, summary, description);
    if (!res.success) {
      setCommitting(false);
      Alert.alert("Commit Failed", res.error || "Could not commit changes.");
      return;
    }
    setSelectedFile(null);
    setDiffText("");
    if (!isLandscape) setPortraitShowDetail(false);

    if (!remoteUrl) {
      setCommitting(false);
      refreshGitState();
      Alert.alert(
        "Committed Locally",
        "Your commit was created, but no remote repository is configured. Would you like to publish this repository now?",
        [
          { text: "Later", style: "cancel" },
          { text: "Publish to GitHub", onPress: () => setShowRemoteModal(true) },
        ]
      );
      return;
    }

    const pushRes = await pushGitRemote(workspaceId, status?.currentBranch);
    setCommitting(false);
    refreshGitState();
    Alert.alert(pushRes.success ? "Success" : "Pushed with notice", pushRes.success ? "Committed and pushed changes to remote!" : pushRes.message);
  };

  const handleSaveRemote = async (url: string): Promise<{ success: boolean; error?: string }> => {
    const res = await setGitRemoteUrl(workspaceId, url);
    if (res.success) {
      setStableRemoteUrl(url.trim() ? url.trim() : null);
      refreshGitState();
    }
    return res;
  };

  // Auth failures route to the credentials modal instead of a dead-end alert.
  const showSyncResult = (title: string, message: string) => {
    if (!isGitAuthError(message)) return Alert.alert(title, message);
    Alert.alert(
      `${title} Needs Authentication`,
      `${message}\n\nAdd your GitHub credentials to continue.`,
      [
        { text: "Later", style: "cancel" },
        { text: "Add Credentials", onPress: () => setShowCredentialsModal(true) },
      ]
    );
  };

  const handlePush = async () => {
    if (!status?.isRepo) return;
    if (!remoteUrl) return setShowRemoteModal(true);
    if (status.detached) {
      return Alert.alert("Detached HEAD", "Switch to a local branch before pushing.");
    }
    setSyncing(true);
    const res = await pushGitRemote(workspaceId, status.currentBranch);
    setSyncing(false);
    refreshGitState();
    showSyncResult("Push", res.message);
  };

  const handleSync = async () => {
    if (!status?.isRepo) return;
    if (!remoteUrl) return setShowRemoteModal(true);
    setSyncing(true);
    let res: { message: string };
    if (status.behind > 0) res = await pullGitRemote(workspaceId, status.currentBranch);
    else if (status.ahead > 0) res = await pushGitRemote(workspaceId, status.currentBranch);
    else res = await fetchGitRemote(workspaceId);
    setSyncing(false);
    refreshGitState();
    showSyncResult(status.behind > 0 ? "Pull" : status.ahead > 0 ? "Push" : "Fetch", res.message);
  };

  const handleSwitchBranch = async (branchName: string) => {
    const res = await switchGitBranch(workspaceId, branchName);
    if (!res.success) {
      Alert.alert("Error", res.error || "Could not switch branch.");
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
    else Alert.alert("Error", res.error || "Could not create branch.");
  };

  const handleInitRepo = async () => {
    const ok = await initGitRepo(workspaceId);
    if (ok) refreshGitState();
    else Alert.alert("Error", "Could not initialize Git repository.");
  };

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
    handleSync,
    handleSwitchBranch,
    handleCreateBranch,
    handleInitRepo,
  };
}
