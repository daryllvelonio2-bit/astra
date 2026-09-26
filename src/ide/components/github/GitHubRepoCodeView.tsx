import React, { useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { fetchContents, fetchCommits } from "../../services/gitHubRepoService";
import { useGitHubResource } from "./useGitHubResource";
import { EmptyState, ErrorState, LoadingState } from "./GitHubStates";
import { GitHubRepo } from "../../services/gitHubTypes";
import { formatStale } from "../../services/gitHubProfileService";

/**
 * Code tab: browse a repo's tree at a chosen ref, open files, and see the
 * latest commit touching the folder. Parent folder is a real row so
 * navigation never traps the user.
 */

export function GitHubRepoCodeView({
  repo,
  refName,
  path,
  onOpenFile,
  onOpenPath,
  onOpenCommits,
}: {
  repo: GitHubRepo;
  refName: string;
  path: string;
  onOpenFile: (filePath: string) => void;
  onOpenPath: (nextPath: string) => void;
  onOpenCommits: () => void;
}) {
  const { theme } = useTheme();

  const tree = useGitHubResource(
    () => fetchContents(repo.owner, repo.name, path, refName),
    [repo.owner, repo.name, path, refName]
  );
  const latest = useGitHubResource(
    () => fetchCommits(repo.owner, repo.name, { ref: refName, path: path || undefined, limit: 1 }),
    [repo.owner, repo.name, refName, path]
  );

  const open = useCallback(
    (entryPath: string, isDir: boolean) => {
      if (isDir) onOpenPath(entryPath);
      else onOpenFile(entryPath);
    },
    [onOpenFile, onOpenPath]
  );

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {!!path && (
        <TouchableOpacity
          style={[styles.row, { borderBottomColor: theme.border }]}
          onPress={() => onOpenPath(path.split("/").slice(0, -1).join("/"))}
          activeOpacity={0.7}
        >
          <Octicons name="arrow-left" size={13} color={theme.accent} />
          <Text style={[styles.rowName, { color: theme.accent }]} numberOfLines={1}>
            ..
          </Text>
        </TouchableOpacity>
      )}

      {!!path && (
        <Text style={[styles.crumb, { color: theme.textMuted }]} numberOfLines={1}>
          {repo.fullName}/{path}
        </Text>
      )}

      {tree.loading && !tree.data ? (
        <LoadingState />
      ) : tree.error ? (
        <ErrorState error={tree.error} onRetry={tree.refresh} />
      ) : (tree.data || []).length === 0 ? (
        <EmptyState text="This folder is empty." />
      ) : (
        <View>
          {(tree.data || [])
            .slice()
            .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1))
            .map((entry) => {
              const isDir = entry.type === "dir";
              return (
                <TouchableOpacity
                  key={entry.path}
                  style={[styles.row, { borderBottomColor: theme.border }]}
                  onPress={() => open(entry.path, isDir)}
                  activeOpacity={0.7}
                >
                  <Octicons
                    name={isDir ? "file-directory" : entry.type === "symlink" ? "file-symlink-file" : "file"}
                    size={13}
                    color={isDir ? theme.accent : theme.textMuted}
                  />
                  <Text style={[styles.rowName, { color: theme.textPrimary }]} numberOfLines={1}>
                    {entry.name}
                  </Text>
                  {!isDir && entry.size > 0 && (
                    <Text style={[styles.rowSize, { color: theme.textMuted }]}>{formatBytes(entry.size)}</Text>
                  )}
                  <Octicons name="chevron-right" size={12} color={theme.textMuted} />
                </TouchableOpacity>
              );
            })}
        </View>
      )}

      {latest.data && latest.data.length > 0 && (
        <TouchableOpacity
          style={[styles.lastCommit, { borderTopColor: theme.border }]}
          onPress={onOpenCommits}
          activeOpacity={0.7}
        >
          <Octicons name="history" size={13} color={theme.textSecondary} />
          <View style={styles.commitBody}>
            <Text style={[styles.commitMessage, { color: theme.textPrimary }]} numberOfLines={1}>
              {latest.data[0].message}
            </Text>
            <Text style={[styles.commitMeta, { color: theme.textMuted }]} numberOfLines={1}>
              {latest.data[0].authorName} · {formatStale(latest.data[0].date)} · {latest.data[0].shortSha}
            </Text>
          </View>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowName: { flex: 1, fontSize: 12.5 },
  rowSize: { fontSize: 10 },
  crumb: { fontSize: 10.5, paddingHorizontal: 12, paddingVertical: 6 },
  lastCommit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  commitBody: { flex: 1, gap: 2 },
  commitMessage: { fontSize: 12, fontWeight: "600" },
  commitMeta: { fontSize: 10.5 },
});