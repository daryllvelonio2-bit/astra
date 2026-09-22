import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons, Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { useOrientation } from "../../../theme/useOrientation";
import { GitRepoStatus } from "./types";

interface GitHeaderBarProps {
  repoName: string;
  status: GitRepoStatus | null;
  loading: boolean;
  syncing: boolean;
  remoteUrl?: string | null;
  onSelectBranch: () => void;
  onSync: () => void;
  onRefresh: () => void;
  onOpenCredentials: () => void;
  onOpenRemoteModal?: () => void;
  onInitRepo?: () => void;
}

export function GitHeaderBar({
  repoName,
  status,
  loading,
  syncing,
  remoteUrl,
  onSelectBranch,
  onSync,
  onRefresh,
  onOpenCredentials,
  onOpenRemoteModal,
  onInitRepo,
}: GitHeaderBarProps) {
  const { theme } = useTheme();
  const { isLandscape } = useOrientation();

  const getSyncLabel = () => {
    if (syncing) return "Syncing…";
    if (!remoteUrl) return isLandscape ? "Publish" : "Publish repo";
    if (!status) return "Fetch origin";
    if (status.behind > 0) return `Pull (${status.behind})`;
    if (status.ahead > 0) return `Push ${status.ahead}`;
    return isLandscape ? "Fetch" : "Fetch origin";
  };

  const getSyncIcon = () => {
    if (!remoteUrl) return "upload";
    if (!status) return "sync";
    if (status.behind > 0) return "arrow-down";
    if (status.ahead > 0) return "arrow-up";
    return "sync";
  };

  return (
    <View
      style={[
        styles.header,
        isLandscape && styles.headerLandscape,
        { backgroundColor: theme.bgSecondary, borderBottomColor: theme.border },
      ]}
    >
      {/* Current Repository Box */}
      <View style={[styles.repoBox, isLandscape && styles.repoBoxLandscape]}>
        <Octicons name="repo" size={isLandscape ? 12 : 14} color={theme.textSecondary} />
        <Text
          style={[styles.repoName, isLandscape && styles.repoNameLandscape, { color: theme.textPrimary }]}
          numberOfLines={1}
        >
          {repoName}
        </Text>
      </View>

      {status?.isRepo ? (
        <>
          {/* Current Branch Selector */}
          <TouchableOpacity
            style={[
              styles.branchBtn,
              isLandscape && styles.branchBtnLandscape,
              { backgroundColor: theme.bgTertiary, borderColor: theme.border },
            ]}
            onPress={onSelectBranch}
            activeOpacity={0.7}
          >
            <Octicons name="git-branch" size={isLandscape ? 11 : 13} color={theme.accent} />
            <Text
              style={[styles.branchText, isLandscape && styles.branchTextLandscape, { color: theme.textPrimary }]}
              numberOfLines={1}
            >
              {status.currentBranch}
            </Text>
            <Ionicons name="chevron-down" size={isLandscape ? 10 : 12} color={theme.textMuted} />
          </TouchableOpacity>

          {/* Sync (Fetch / Push / Pull / Publish) Action Button */}
          <TouchableOpacity
            style={[
              styles.syncBtn,
              isLandscape && styles.syncBtnLandscape,
              {
                backgroundColor: !remoteUrl || status.ahead > 0 || status.behind > 0 ? theme.accent : theme.bgTertiary,
                borderColor: theme.border,
              },
            ]}
            onPress={!remoteUrl && onOpenRemoteModal ? onOpenRemoteModal : onSync}
            disabled={syncing}
            activeOpacity={0.8}
          >
            {syncing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Octicons
                name={getSyncIcon() as any}
                size={isLandscape ? 10 : 12}
                color={!remoteUrl || status.ahead > 0 || status.behind > 0 ? "#fff" : theme.textSecondary}
              />
            )}
            <Text
              style={[
                styles.syncText,
                isLandscape && styles.syncTextLandscape,
                { color: !remoteUrl || status.ahead > 0 || status.behind > 0 ? "#fff" : theme.textSecondary },
              ]}
            >
              {getSyncLabel()}
            </Text>
          </TouchableOpacity>
        </>
      ) : (
        onInitRepo && (
          <TouchableOpacity
            style={[styles.initBtn, isLandscape && styles.initBtnLandscape, { backgroundColor: theme.accent }]}
            onPress={onInitRepo}
            activeOpacity={0.8}
          >
            <Octicons name="git-commit" size={isLandscape ? 11 : 13} color="#fff" />
            <Text style={[styles.initBtnText, isLandscape && styles.initBtnTextLandscape]}>Initialize Git</Text>
          </TouchableOpacity>
        )
      )}

      {/* Right Utility Buttons */}
      <View style={styles.rightActions}>
        {onOpenRemoteModal && (
          <TouchableOpacity
            style={[styles.iconBtn, isLandscape && styles.iconBtnLandscape]}
            onPress={onOpenRemoteModal}
            accessibilityLabel="Repository Remote"
          >
            <Octicons name="globe" size={isLandscape ? 12 : 14} color={remoteUrl ? theme.accent : theme.textSecondary} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.iconBtn, isLandscape && styles.iconBtnLandscape]}
          onPress={onOpenCredentials}
          accessibilityLabel="GitHub Credentials"
        >
          <Octicons name="key" size={isLandscape ? 12 : 14} color={theme.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.iconBtn, isLandscape && styles.iconBtnLandscape]}
          onPress={onRefresh}
          disabled={loading}
          accessibilityLabel="Refresh Status"
        >
          {loading ? (
            <ActivityIndicator size="small" color={theme.accent} />
          ) : (
            <Ionicons name="refresh-outline" size={isLandscape ? 13 : 16} color={theme.textSecondary} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    gap: 8,
  },
  headerLandscape: {
    height: 32,
    paddingHorizontal: 8,
    gap: 6,
  },
  repoBox: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    minWidth: 0,
    gap: 6,
    maxWidth: 130,
  },
  repoBoxLandscape: {
    maxWidth: 100,
    gap: 4,
  },
  repoName: {
    fontSize: 12,
    fontWeight: "700",
    flexShrink: 1,
  },
  repoNameLandscape: {
    fontSize: 11,
  },
  branchBtn: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    flexShrink: 1,
    minWidth: 64,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    maxWidth: 200,
  },
  branchBtnLandscape: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 4,
    maxWidth: 110,
    gap: 4,
  },
  branchText: {
    fontSize: 11.5,
    fontWeight: "600",
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  branchTextLandscape: {
    fontSize: 10.5,
  },
  syncBtn: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  syncBtnLandscape: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 4,
    gap: 4,
  },
  syncText: {
    fontSize: 11,
    fontWeight: "600",
    flexShrink: 0,
  },
  syncTextLandscape: {
    fontSize: 10,
  },
  initBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  initBtnLandscape: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    gap: 4,
  },
  initBtnText: {
    color: "#fff",
    fontSize: 11.5,
    fontWeight: "700",
  },
  initBtnTextLandscape: {
    fontSize: 10.5,
  },
  rightActions: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    marginLeft: "auto",
    gap: 6,
  },
  iconBtn: {
    padding: 6,
  },
  iconBtnLandscape: {
    padding: 3,
  },
});
