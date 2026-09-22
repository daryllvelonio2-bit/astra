import React from "react";
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Image, Platform } from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { useOrientation } from "../../../theme/useOrientation";
import { GitCommit } from "./types";
import { gravatarUrl, CommitAvatarMap } from "../../services/gitAvatarService";

interface GitHistoryListProps {
  commits: GitCommit[];
  selectedCommit: GitCommit | null;
  avatars: CommitAvatarMap;
  brokenAvatars: Record<string, boolean>;
  onAvatarError: (hash: string) => void;
  onSelectCommit: (commit: GitCommit) => void;
}

export function GitHistoryList({
  commits,
  selectedCommit,
  avatars,
  brokenAvatars,
  onAvatarError,
  onSelectCommit,
}: GitHistoryListProps) {
  const { theme } = useTheme();
  const { isLandscape } = useOrientation();

  // Resolution order: exact commit SHA → author email (survives rebases) →
  // Gravatar for that email (d=404 fails cleanly) → initial letter.
  const avatarUriFor = (item: GitCommit): string | null => {
    const email = (item.authorEmail || "").trim().toLowerCase();
    return (
      avatars.bySha[item.hash] ||
      (email ? avatars.byEmail[email] : "") ||
      gravatarUrl(email)
    );
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return (name[0] || "?").toUpperCase();
  };

  const getStatusDetails = (status?: string) => {
    switch (status) {
      case "New":
        return { label: "New", color: theme.accentGreen, bg: `${theme.accentGreen}18` };
      case "Deleted":
        return { label: "Deleted", color: theme.accentRed, bg: `${theme.accentRed}18` };
      case "Modified":
      default:
        return { label: "Modified", color: theme.accentGold, bg: `${theme.accentGold}18` };
    }
  };

  return (
    <FlatList
      data={commits}
      keyExtractor={(item) => item.hash}
      initialNumToRender={10}
      maxToRenderPerBatch={10}
      windowSize={5}
      removeClippedSubviews={Platform.OS === "android"}
      style={styles.container}
      contentContainerStyle={commits.length === 0 ? styles.emptyContainer : undefined}
      renderItem={({ item }) => {
        const isSelected = selectedCommit?.hash === item.hash;
        const statusBadge = getStatusDetails(item.status);
        const avatarUri = !brokenAvatars[item.hash] ? avatarUriFor(item) : null;
        return (
          <TouchableOpacity
            style={[
              styles.commitRow,
              isLandscape && styles.commitRowLandscape,
              { borderBottomColor: theme.border },
              isSelected && { backgroundColor: `${theme.accent}18` },
            ]}
            onPress={() => onSelectCommit(item)}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.avatar,
                isLandscape && styles.avatarLandscape,
                { backgroundColor: theme.bgTertiary, borderColor: theme.border },
              ]}
            >
              {avatarUri ? (
                <Image
                  source={{ uri: avatarUri }}
                  style={[styles.avatarImage, isLandscape && styles.avatarImageLandscape]}
                  onError={() => onAvatarError(item.hash)}
                />
              ) : (
                <Text
                  style={[
                    styles.avatarText,
                    isLandscape && styles.avatarTextLandscape,
                    { color: theme.textSecondary },
                  ]}
                >
                  {getInitials(item.authorName)}
                </Text>
              )}
            </View>
            <View style={styles.contentCol}>
              <Text
                style={[
                  styles.commitMessage,
                  isLandscape && styles.commitMessageLandscape,
                  { color: theme.textPrimary },
                  isSelected && { color: theme.accent, fontWeight: "700" },
                ]}
                numberOfLines={isLandscape ? 1 : 2}
              >
                {item.message}
              </Text>
              <View style={[styles.metaRow, isLandscape && styles.metaRowLandscape]}>
                <Text
                  style={[
                    styles.authorName,
                    isLandscape && styles.authorNameLandscape,
                    { color: theme.textMuted },
                  ]}
                  numberOfLines={1}
                >
                  {item.authorName}
                </Text>
                <Text style={[styles.dot, { color: theme.textMuted }]}>·</Text>
                <Text
                  style={[
                    styles.timeAgo,
                    isLandscape && styles.timeAgoLandscape,
                    { color: theme.textMuted },
                  ]}
                >
                  {item.relativeTime}
                </Text>
                <Text style={[styles.dot, { color: theme.textMuted }]}>·</Text>
                <Text
                  style={[
                    styles.hashSubText,
                    isLandscape && styles.hashSubTextLandscape,
                    { color: theme.textMuted },
                  ]}
                >
                  #{item.shortHash}
                </Text>
              </View>
            </View>

            <View style={[styles.rightCol, isLandscape && styles.rightColLandscape]}>
              {/* Diff Stats: +Added (green) and -Deleted (red) */}
              {((item.additions || 0) > 0 || (item.deletions || 0) > 0) && (
                <View style={styles.statsRow}>
                  {(item.additions || 0) > 0 && (
                    <Text style={[styles.statAdd, isLandscape && styles.statAddLandscape, { color: theme.accentGreen }]}>
                      +{item.additions}
                    </Text>
                  )}
                  {(item.deletions || 0) > 0 && (
                    <Text style={[styles.statDel, isLandscape && styles.statDelLandscape, { color: theme.accentRed }]}>
                      -{item.deletions}
                    </Text>
                  )}
                </View>
              )}

              {/* Status Badge */}
              <View
                style={[
                  styles.statusBadge,
                  isLandscape && styles.statusBadgeLandscape,
                  { backgroundColor: statusBadge.bg },
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    isLandscape && styles.statusBadgeTextLandscape,
                    { color: statusBadge.color },
                  ]}
                >
                  {statusBadge.label}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      }}
      ListEmptyComponent={
        <View style={styles.emptyView}>
          <Octicons name="history" size={32} color={theme.textMuted} />
          <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>No commit history</Text>
          <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
            Commits made to this repository will appear here.
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  commitRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  commitRowLandscape: {
    paddingVertical: 6,
    paddingHorizontal: 6,
    gap: 6,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLandscape: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  avatarText: {
    fontSize: 11,
    fontWeight: "700",
  },
  avatarTextLandscape: {
    fontSize: 8.5,
  },
  avatarImage: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  avatarImageLandscape: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  contentCol: {
    flex: 1,
  },
  commitMessage: {
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 16,
  },
  commitMessageLandscape: {
    fontSize: 10.5,
    lineHeight: 14,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  metaRowLandscape: {
    gap: 2,
    marginTop: 1,
  },
  authorName: {
    fontSize: 10.5,
  },
  authorNameLandscape: {
    fontSize: 9,
    maxWidth: 60,
  },
  dot: {
    fontSize: 10,
  },
  timeAgo: {
    fontSize: 10.5,
  },
  timeAgoLandscape: {
    fontSize: 9,
  },
  hashSubText: {
    fontFamily: "monospace",
    fontSize: 9.5,
  },
  hashSubTextLandscape: {
    fontSize: 8,
  },
  rightCol: {
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 3,
  },
  rightColLandscape: {
    gap: 1.5,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  statAdd: {
    fontSize: 10,
    fontWeight: "700",
    fontFamily: "monospace",
  },
  statAddLandscape: {
    fontSize: 8.5,
  },
  statDel: {
    fontSize: 10,
    fontWeight: "700",
    fontFamily: "monospace",
  },
  statDelLandscape: {
    fontSize: 8.5,
  },
  statusBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 3,
  },
  statusBadgeLandscape: {
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 2,
  },
  statusBadgeText: {
    fontSize: 9.5,
    fontWeight: "700",
  },
  statusBadgeTextLandscape: {
    fontSize: 8,
    fontWeight: "700",
  },
  emptyContainer: {
    flexGrow: 1,
  },
  emptyView: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  emptySubtitle: {
    fontSize: 12,
    textAlign: "center",
  },
});
