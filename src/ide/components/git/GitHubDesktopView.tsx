import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  BackHandler,
} from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { useOrientation } from "../../../theme/useOrientation";
import { GitHeaderBar } from "./GitHeaderBar";
import { GitChangesList } from "./GitChangesList";
import { GitHistoryList } from "./GitHistoryList";
import { GitCommitFilesList } from "./GitCommitFilesList";
import { GitDiffViewer } from "./GitDiffViewer";
import { GitBranchModal } from "./GitBranchModal";
import { GitCommitActionsModal } from "./GitCommitActionsModal";
import { GitFileActionsModal } from "./GitFileActionsModal";
import { GitCredentialsModal } from "./GitCredentialsModal";
import { GitProfilePopup } from "./GitProfilePopup";
import { GitRemoteModal } from "./GitRemoteModal";
import { useGitOperations } from "./useGitOperations";
import { useFileActions } from "./useFileActions";
import { useMergeConflicts } from "./useMergeConflicts";
import { loadGitHubSession, GitHubSession } from "../../services/gitService";

interface GitHubDesktopViewProps {
  workspaceId?: string;
  projectName?: string;
  visible: boolean;
}

export function GitHubDesktopView({
  workspaceId,
  projectName = "Project",
  visible,
}: GitHubDesktopViewProps) {
  const { theme } = useTheme();
  const { isLandscape } = useOrientation();

  const {
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

    handleSaveRemote,
    handlePush,
    handleFetch,
    handlePull,
    handleSwitchBranch,
    handleCreateBranch,
    handleInitRepo,
  } = useGitOperations(workspaceId, visible, isLandscape);

  // Long-press file menu in the Changes tab (discard / ignore / copy / GitHub).
  const {
    showFileActions,
    fileActionTarget,
    fileActionAnchor,
    fileActionsBusy,
    githubUrl: fileGithubUrl,
    openFileActions,
    closeFileActions,
    fileActionHandlers,
  } = useFileActions({
    workspaceId,
    remoteUrl,
    currentBranch: status?.currentBranch,
    refreshGitState,
  });

  // GitHub account (device-flow session). Drives the header avatar and the
  // anchored profile popup; the popup owns sign-out itself.
  const [ghSession, setGhSession] = useState<GitHubSession | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [profileAnchor, setProfileAnchor] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (visible) {
      loadGitHubSession().then(setGhSession).catch(() => setGhSession(null));
    }
  }, [visible, showCredentialsModal]);

  const openProfile = useCallback((anchor: { x: number; y: number }) => {
    setProfileAnchor(anchor);
    setShowProfile(true);
  }, []);

  const files = status?.files || [];

  // Merge conflicts: re-checked whenever git status refreshes (`files` identity).
  const {
    mergeState,
    conflictedSet,
    mergeBusy,
    resolveWith,
    abortMergeOp,
    completeMergeOp,
    openInEditor,
  } = useMergeConflicts({ workspaceId, files, refreshGitState });

  // System back button (Android) in portrait master/detail navigation:
  // detail -> back goes to the master list instead of leaving the screen.
  useEffect(() => {
    if (isLandscape || !portraitShowDetail) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setPortraitShowDetail(false);
      return true;
    });
    return () => sub.remove();
  }, [isLandscape, portraitShowDetail, setPortraitShowDetail]);

  return (
    <View style={[styles.container, { backgroundColor: theme.bgPrimary }]}>
      {/* Top Header Bar */}
      <GitHeaderBar
        repoName={projectName}
        status={status}
        syncing={syncing}
        remoteUrl={remoteUrl}
        onSelectBranch={() => setShowBranchModal(true)}
        onFetch={handleFetch}
        onPull={handlePull}
        onPush={handlePush}
        onOpenCredentials={() => setShowCredentialsModal(true)}
        onOpenRemoteModal={() => setShowRemoteModal(true)}
        onInitRepo={handleInitRepo}
        ghSession={ghSession}
        onPressProfile={openProfile}
      />

      {/* Main Workspace Area */}
      <View style={styles.contentRow}>
        {/* Left Sidebar (or full view in portrait when detail is false) */}
        {(!portraitShowDetail || isLandscape) && (
          <View style={[styles.sidebar, isLandscape && styles.sidebarLandscape, { borderRightColor: theme.border, backgroundColor: theme.bgSecondary }]}>
            {/* Tabs: Changes vs History (underline style, no boxes) */}
            <View style={[styles.tabBar, { borderBottomColor: theme.border }]} accessibilityRole="tablist">
              <TouchableOpacity
                style={styles.tabBtn}
                onPress={() => setActiveTab("changes")}
                accessibilityRole="tab"
                accessibilityState={{ selected: activeTab === "changes" }}
              >
                <Octicons
                  name="diff-modified"
                  size={isLandscape ? 10 : 12}
                  color={activeTab === "changes" ? theme.accent : theme.textMuted}
                />
                <Text
                  style={[
                    styles.tabBtnText,
                    isLandscape && styles.tabBtnTextLandscape,
                    { color: activeTab === "changes" ? theme.textPrimary : theme.textSecondary },
                    activeTab === "changes" && { fontWeight: "700" },
                  ]}
                  numberOfLines={1}
                >
                  Changes{files.length > 0 ? ` (${files.length})` : ""}
                </Text>
                <View style={[styles.tabUnderline, { backgroundColor: activeTab === "changes" ? theme.accent : "transparent" }]} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.tabBtn}
                onPress={() => setActiveTab("history")}
                accessibilityRole="tab"
                accessibilityState={{ selected: activeTab === "history" }}
              >
                <Octicons
                  name="history"
                  size={isLandscape ? 10 : 12}
                  color={activeTab === "history" ? theme.accent : theme.textMuted}
                />
                <Text
                  style={[
                    styles.tabBtnText,
                    isLandscape && styles.tabBtnTextLandscape,
                    { color: activeTab === "history" ? theme.textPrimary : theme.textSecondary },
                    activeTab === "history" && { fontWeight: "700" },
                  ]}
                  numberOfLines={1}
                >
                  History
                </Text>
                <View style={[styles.tabUnderline, { backgroundColor: activeTab === "history" ? theme.accent : "transparent" }]} />
              </TouchableOpacity>
            </View>

            {activeTab === "changes" ? (
              <GitChangesList
                files={files}
                workspaceId={workspaceId}
                selectedFile={selectedFile}
                currentBranch={status?.currentBranch || "main"}
                ahead={status?.ahead || 0}
                detached={status?.detached || false}
                committing={committing || syncing}
                onSelectFile={loadFileDiff}
                onToggleStageFile={handleToggleStageFile}
                onToggleStageAll={handleToggleStageAll}
                onCommit={handleCommit}
                onLongPressFile={openFileActions}
                mergeState={mergeState}
                conflictedPaths={conflictedSet}
                mergeBusy={mergeBusy}
                onAbortMerge={abortMergeOp}
                onCompleteMerge={completeMergeOp}
              />
            ) : selectedCommit ? (
              <GitCommitFilesList
                commit={selectedCommit}
                files={commitFiles}
                selectedFile={selectedCommitFile}
                loading={loadingCommitFiles}
                onSelectFile={handleSelectCommitFile}
                onBackToCommits={handleBackToCommits}
              />
            ) : (
              <GitHistoryList
                commits={commits}
                selectedCommit={selectedCommit}
                avatars={avatars}
                brokenAvatars={brokenAvatars}
                onAvatarError={markBroken}
                onSelectCommit={loadCommitDiff}
                onLongPressCommit={openCommitActions}
              />
            )}
          </View>
        )}

        {/* Right Main Pane: Diff Viewer (or full view in portrait when detail is true) */}
        {(portraitShowDetail || isLandscape) && (
          <View style={styles.diffPane}>
            <GitDiffViewer
              diff={diffText}
              loading={loadingDiff}
              selectedFile={selectedFile}
              selectedCommit={selectedCommit}
              selectedCommitFile={selectedCommitFile}
              onBackToMaster={!isLandscape ? () => setPortraitShowDetail(false) : undefined}
            />
          </View>
        )}
      </View>

      {/* Branch Switcher Modal */}
      <GitBranchModal
        visible={showBranchModal}
        branches={branches}
        currentBranch={status?.currentBranch || "main"}
        loading={loadingStatus}
        onClose={() => setShowBranchModal(false)}
        onSwitchBranch={handleSwitchBranch}
        onCreateBranch={handleCreateBranch}
      />

      {/* GitHub Credentials Modal */}
      <GitCredentialsModal
        visible={showCredentialsModal}
        onClose={() => setShowCredentialsModal(false)}
      />

      {/* GitHub Profile Popup (anchored to the header avatar) */}
      <GitProfilePopup
        visible={showProfile}
        anchor={profileAnchor}
        workspaceId={workspaceId}
        onClose={() => setShowProfile(false)}
        onSignedOut={() => setGhSession(null)}
        onOpenRemote={() => setShowRemoteModal(true)}
      />

      {/* GitHub Remote Manager Modal */}
      <GitRemoteModal
        visible={showRemoteModal}
        currentRemoteUrl={remoteUrl}
        onClose={() => setShowRemoteModal(false)}
        onSaveRemote={handleSaveRemote}
      />

      {/* File Actions Modal (long-press on a changes row) */}
      {fileActionTarget && (
        <GitFileActionsModal
          visible={showFileActions}
          anchor={fileActionAnchor}
          file={fileActionTarget}
          canOpenOnGitHub={!!fileGithubUrl}
          busy={fileActionsBusy || mergeBusy}
          onClose={closeFileActions}
          actions={fileActionHandlers}
          conflicted={conflictedSet.has(fileActionTarget.path)}
          onUseOurs={() => resolveWith(fileActionTarget.path, "ours")}
          onUseTheirs={() => resolveWith(fileActionTarget.path, "theirs")}
          onOpenInEditor={() => openInEditor(fileActionTarget.path)}
        />
      )}

      {/* Commit Actions Modal (long-press on a history row) */}
      {commitActionTarget && (
        <GitCommitActionsModal
          visible={showCommitActions}
          anchor={commitActionAnchor}
          commitSummary={commitActionTarget.message}
          amendInitialMessage={amendInitialMessage || commitActionTarget.message}
          shortHash={commitActionTarget.shortHash}
          canViewOnGitHub={!!remoteUrl && remoteUrl.includes("github.com")}
          busy={commitActionBusy}
          onClose={closeCommitActions}
          actions={{
            amend: handleAmend,
            reset: handleResetToCommit,
            checkout: handleCheckoutCommit,
            revert: handleRevertCommit,
            createBranch: handleCreateBranchFromCommit,
            createTag: handleCreateTag,
            cherryPick: handleCherryPickCommit,
            copySha: handleCopyCommitSha,
            viewOnGitHub: handleViewCommitOnGitHub,
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentRow: {
    flex: 1,
    flexDirection: "row",
  },
  sidebar: {
    flex: 1,
  },
  sidebarLandscape: {
    flex: 0,
    width: 190,
    maxWidth: "25%",
    borderRightWidth: 1,
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 6,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
  },
  tabUnderline: {
    position: "absolute",
    bottom: 0,
    left: "22%",
    right: "22%",
    height: 2,
    borderRadius: 1,
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  tabBtnTextLandscape: {
    fontSize: 10.5,
  },
  diffPane: {
    flex: 1,
  },
});
