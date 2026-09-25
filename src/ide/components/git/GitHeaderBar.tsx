import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons, Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { useOrientation } from "../../../theme/useOrientation";
import { GitRepoStatus } from "./types";
import { GitHubSession } from "../../services/gitService";

interface GitHeaderBarProps {
  repoName: string;
  status: GitRepoStatus | null;
  syncing: boolean;
  remoteUrl?: string | null;
  onSelectBranch: () => void;
  onFetch: () => void;
  onPull: () => void;
  onPush: () => void;
  onOpenCredentials: () => void;
  onOpenRemoteModal?: () => void;
  onInitRepo?: () => void;
  ghSession?: GitHubSession | null;
  onPressProfile?: (anchor: { x: number; y: number }) => void;
}

export function GitHeaderBar({
  repoName,
  status,
  syncing,
  remoteUrl,
  onSelectBranch,
  onFetch,
  onPull,
  onPush,
  onOpenCredentials,
  onOpenRemoteModal,
  onInitRepo,
  ghSession,
  onPressProfile,
}: GitHeaderBarProps) {
  const { theme } = useTheme();
  const { isLandscape } = useOrientation();

  const isRepo = !!status?.isRepo;
  const ahead = status?.ahead ?? 0;
  const behind = status?.behind ?? 0;
  const iconSize = isLandscape ? 10 : 12;

  // One dynamic sync action: pull when behind, push when ahead, else fetch.
  const op = behind > 0 ? "pull" : ahead > 0 ? "push" : "fetch";
  const syncGlyph = op === "pull" ? "arrow-down" : op === "push" ? "arrow-up" : "sync";
  const syncLabel = op === "pull" ? "Pull" : op === "push" ? "Push" : "Fetch";
  const syncBadge = op === "pull" ? behind : op === "push" ? ahead : 0;
  const syncActive = op !== "fetch";
  const syncAction = op === "pull" ? onPull : op === "push" ? onPush : onFetch;

  return (
    <View
      style={[
        styles.header,
        isLandscape && styles.headerLandscape,
        { backgroundColor: theme.bgSecondary, borderBottomColor: theme.border },
      ]}
    >
      {isRepo ? (
        <>
          {/* Compact repo | branch chip (tap = branch switcher) */}
          <TouchableOpacity
            style={[
              styles.repoBranchChip,
              isLandscape && styles.repoBranchChipLandscape,
              { backgroundColor: theme.bgTertiary, borderColor: theme.border },
            ]}
            onPress={onSelectBranch}
            activeOpacity={0.7}
          >
            <Octicons name="git-branch" size={isLandscape ? 10 : 12} color={theme.accent} />
            <Text
              style={[styles.chipRepo, isLandscape && styles.chipSmall, { color: theme.textSecondary }]}
              numberOfLines={1}
            >
              {repoName}
            </Text>
            <Text style={[styles.chipSep, { color: theme.border }]}>|</Text>
            <Text
              style={[styles.chipBranch, isLandscape && styles.chipSmall, { color: theme.textPrimary }]}
              numberOfLines={1}
            >
              {status?.currentBranch}
            </Text>
            <Ionicons name="chevron-down" size={isLandscape ? 9 : 11} color={theme.textMuted} />
          </TouchableOpacity>

          {/* Single dynamic sync button: icon = pending op, badge = count */}
          <View style={styles.syncGroup}>
            {remoteUrl ? (
              <TouchableOpacity
                style={[
                  styles.iconAction,
                  isLandscape && styles.iconActionLandscape,
                  {
                    backgroundColor: syncActive ? theme.accent : theme.bgTertiary,
                    borderColor: theme.border,
                  },
                ]}
                onPress={syncAction}
                disabled={syncing}
                activeOpacity={0.7}
                accessibilityLabel={op}
              >
                {syncing ? (
                  <ActivityIndicator size="small" color={syncActive ? "#fff" : theme.accent} />
                ) : (
                  <Octicons
                    name={syncGlyph as any}
                    size={iconSize}
                    color={syncActive ? "#fff" : theme.textSecondary}
                  />
                )}
                <Text
                  style={[
                    styles.syncText,
                    isLandscape && styles.chipSmall,
                    { color: syncActive ? "#fff" : theme.textSecondary },
                  ]}
                >
                  {syncing ? "..." : syncLabel}
                </Text>
                {syncBadge > 0 && !syncing && (
                  <View style={[styles.badge, { backgroundColor: syncActive ? "#fff" : theme.accent }]}>
                    <Text style={[styles.badgeText, { color: syncActive ? theme.accent : "#fff" }]}>
                      {syncBadge > 99 ? "99+" : syncBadge}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  styles.iconAction,
                  isLandscape && styles.iconActionLandscape,
                  { backgroundColor: theme.accent, borderColor: theme.accent },
                ]}
                onPress={onOpenRemoteModal || onOpenCredentials}
                activeOpacity={0.8}
                accessibilityLabel="Publish repository"
              >
                <Octicons name="rocket" size={iconSize} color="#fff" />
                <Text style={styles.syncText}>Publish</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      ) : (
        onInitRepo && (
          <TouchableOpacity
            style={[styles.initBtn, { backgroundColor: theme.accent }]}
            onPress={onInitRepo}
            activeOpacity={0.8}
          >
            <Octicons name="git-commit" size={isLandscape ? 10 : 12} color="#fff" />
            <Text style={styles.initBtnText}>Initialize Git</Text>
          </TouchableOpacity>
        )
      )}

      {/* Account: signed-in = avatar (opens profile popup), signed-out = key */}
      <View style={styles.rightActions}>
        {ghSession && onPressProfile ? (
          <TouchableOpacity
            style={styles.iconBtn}
            onPressIn={(e) => onPressProfile({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })}
            accessibilityLabel="GitHub Profile"
          >
            {ghSession.avatarUrl ? (
              <Image source={{ uri: ghSession.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.accent }]}>
                <Text style={styles.avatarLetter}>{ghSession.username.slice(0, 1).toUpperCase()}</Text>
              </View>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.iconBtn} onPress={onOpenCredentials} accessibilityLabel="GitHub Credentials">
            <Octicons name="key" size={isLandscape ? 13 : 16} color={theme.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    gap: 6,
  },
  headerLandscape: {
    height: 30,
    paddingHorizontal: 6,
    gap: 4,
  },
  repoBranchChip: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    minWidth: 0,
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    maxWidth: 190,
  },
  repoBranchChipLandscape: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    maxWidth: 150,
    gap: 4,
  },
  chipRepo: { fontSize: 11, fontWeight: "600", maxWidth: 72, flexShrink: 1 },
  chipBranch: { fontSize: 11, fontWeight: "700", flexShrink: 1, minWidth: 0 },
  chipSep: { fontSize: 11 },
  chipSmall: { fontSize: 10 },
  syncGroup: { flexDirection: "row", alignItems: "center", gap: 4, marginLeft: "auto" },
  iconAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minWidth: 26,
    height: 24,
    paddingHorizontal: 7,
    borderRadius: 5,
    borderWidth: 1,
  },
  iconActionLandscape: { height: 21, paddingHorizontal: 5, gap: 3 },
  syncText: { fontSize: 10, fontWeight: "700" },
  badge: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 8.5, fontWeight: "800" },
  initBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  initBtnText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  rightActions: { flexDirection: "row", alignItems: "center", flexShrink: 0, marginLeft: 6 },
  iconBtn: { padding: 4 },
  avatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#333" },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarLetter: { color: "#fff", fontSize: 12, fontWeight: "800" },
});
