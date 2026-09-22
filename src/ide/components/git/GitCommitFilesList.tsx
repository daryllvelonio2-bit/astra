import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from "react-native";
import { Ionicons, Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { useOrientation } from "../../../theme/useOrientation";
import { GitCommit, GitCommitFile } from "./types";

interface GitCommitFilesListProps {
  commit: GitCommit;
  files: GitCommitFile[];
  selectedFile: GitCommitFile | null;
  loading: boolean;
  onSelectFile: (file: GitCommitFile) => void;
  onBackToCommits: () => void;
}

export function GitCommitFilesList({
  commit,
  files,
  selectedFile,
  loading,
  onSelectFile,
  onBackToCommits,
}: GitCommitFilesListProps) {
  const { theme } = useTheme();
  const { isLandscape } = useOrientation();

  const getStatusColor = (status: GitCommitFile["status"]) => {
    switch (status) {
      case "added":
        return theme.accentGreen;
      case "deleted":
        return theme.accentRed;
      case "renamed":
        return theme.accent;
      case "modified":
      default:
        return theme.accentGold;
    }
  };

  const getStatusLabel = (status: GitCommitFile["status"]) => {
    switch (status) {
      case "added":
        return "New";
      case "deleted":
        return "Deleted";
      case "renamed":
        return "Renamed";
      case "modified":
      default:
        return "Modified";
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bgSecondary }]}>
      {/* Top Back & Header Bar */}
      <View
        style={[
          styles.headerBar,
          isLandscape && styles.headerBarLandscape,
          { borderBottomColor: theme.border },
        ]}
      >
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: `${theme.accent}14` }]}
          onPress={onBackToCommits}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={isLandscape ? 12 : 14} color={theme.accent} />
          <Text
            style={[styles.backBtnText, isLandscape && styles.backBtnTextLandscape, { color: theme.accent }]}
            numberOfLines={1}
          >
            Commits
          </Text>
        </TouchableOpacity>

        <View style={styles.commitMetaCol}>
          <Text
            style={[styles.commitMsg, isLandscape && styles.commitMsgLandscape, { color: theme.textPrimary }]}
            numberOfLines={isLandscape ? 1 : 2}
          >
            {commit.message}
          </Text>
          <View style={styles.commitSubRow}>
            <Text
              style={[styles.commitSubText, isLandscape && styles.commitSubTextLandscape, { color: theme.textMuted }]}
              numberOfLines={1}
            >
              {commit.shortHash} · {commit.relativeTime}
            </Text>
            <View style={styles.statsRow}>
              {(commit.additions ?? 0) > 0 && (
                <Text style={[styles.statText, { color: theme.accentGreen }]}>
                  +{commit.additions}
                </Text>
              )}
              {(commit.deletions ?? 0) > 0 && (
                <Text style={[styles.statText, { color: theme.accentRed }]}>
                  -{commit.deletions}
                </Text>
              )}
            </View>
          </View>
        </View>
      </View>

      {/* Changed Files Header */}
      <View
        style={[
          styles.sectionHeader,
          isLandscape && styles.sectionHeaderLandscape,
          { backgroundColor: theme.bgTertiary, borderBottomColor: theme.border },
        ]}
      >
        <Text
          style={[styles.sectionTitle, isLandscape && styles.sectionTitleLandscape, { color: theme.textSecondary }]}
        >
          Changed Files ({files.length})
        </Text>
      </View>

      {/* Files List */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="small" color={theme.accent} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading files…</Text>
        </View>
      ) : (
        <FlatList
          data={files}
          keyExtractor={(item) => item.path}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={Platform.OS === "android"}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isSelected = selectedFile?.path === item.path;
            const statusColor = getStatusColor(item.status);
            const statusLabel = getStatusLabel(item.status);
            const dirPath = item.path.includes("/")
              ? item.path.substring(0, item.path.lastIndexOf("/"))
              : "";

            return (
              <TouchableOpacity
                style={[
                  styles.fileRow,
                  isLandscape && styles.fileRowLandscape,
                  { borderBottomColor: `${theme.border}40` },
                  isSelected && {
                    backgroundColor: `${theme.accent}16`,
                    borderLeftColor: theme.accent,
                    borderLeftWidth: 3,
                  },
                ]}
                onPress={() => onSelectFile(item)}
                activeOpacity={0.7}
              >
                <View style={styles.fileRowLeft}>
                  <Octicons
                    name={
                      item.status === "deleted"
                        ? "diff-removed"
                        : item.status === "added"
                        ? "diff-added"
                        : "file"
                    }
                    size={isLandscape ? 12 : 14}
                    color={statusColor}
                    style={styles.fileIcon}
                  />
                  <View style={styles.fileTextCol}>
                    <Text
                      style={[
                        styles.fileName,
                        isLandscape && styles.fileNameLandscape,
                        { color: isSelected ? theme.accent : theme.textPrimary },
                        isSelected && styles.fileNameSelected,
                      ]}
                      numberOfLines={1}
                    >
                      {item.filename}
                    </Text>
                    {dirPath ? (
                      <Text
                        style={[
                          styles.fileDir,
                          isLandscape && styles.fileDirLandscape,
                          { color: theme.textMuted },
                        ]}
                        numberOfLines={1}
                      >
                        {dirPath}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <View style={styles.fileRowRight}>
                  <View style={[styles.statusBadge, { backgroundColor: `${statusColor}18` }]}>
                    <Text
                      style={[
                        styles.statusBadgeText,
                        isLandscape && styles.statusBadgeTextLandscape,
                        { color: statusColor },
                      ]}
                    >
                      {statusLabel}
                    </Text>
                  </View>
                  {!isLandscape && (
                    <Ionicons
                      name="chevron-forward"
                      size={12}
                      color={theme.textMuted}
                      style={{ marginLeft: 4 }}
                    />
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.centerEmpty}>
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                No changed files in this commit
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBar: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 6,
  },
  headerBarLandscape: {
    paddingHorizontal: 6,
    paddingVertical: 5,
    gap: 4,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  backBtnText: {
    fontSize: 11.5,
    fontWeight: "600",
  },
  backBtnTextLandscape: {
    fontSize: 10,
  },
  commitMetaCol: {
    gap: 2,
  },
  commitMsg: {
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
  },
  commitMsgLandscape: {
    fontSize: 11,
    lineHeight: 14,
  },
  commitSubRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  commitSubText: {
    fontSize: 10,
    flex: 1,
  },
  commitSubTextLandscape: {
    fontSize: 9,
  },
  statsRow: {
    flexDirection: "row",
    gap: 4,
    marginLeft: 4,
  },
  statText: {
    fontSize: 10,
    fontWeight: "700",
    fontFamily: "monospace",
  },
  sectionHeader: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionHeaderLandscape: {
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  sectionTitle: {
    fontSize: 10.5,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  sectionTitleLandscape: {
    fontSize: 9,
  },
  listContent: {
    paddingVertical: 2,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fileRowLandscape: {
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  fileRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 6,
  },
  fileIcon: {
    marginRight: 6,
  },
  fileTextCol: {
    flex: 1,
  },
  fileName: {
    fontSize: 11.5,
    fontWeight: "500",
  },
  fileNameLandscape: {
    fontSize: 10.5,
  },
  fileNameSelected: {
    fontWeight: "700",
  },
  fileDir: {
    fontSize: 9.5,
    marginTop: 1,
  },
  fileDirLandscape: {
    fontSize: 8.5,
  },
  fileRowRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: "700",
  },
  statusBadgeTextLandscape: {
    fontSize: 8,
  },
  centerLoading: {
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingText: {
    fontSize: 11,
  },
  centerEmpty: {
    padding: 20,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 11,
  },
});
