import React, { useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { fetchContents, fetchReadme } from "../../services/gitHubRepoService";
import { useGitHubResource } from "./useGitHubResource";
import { EmptyState, ErrorState, LoadingState } from "./GitHubStates";
import { GitHubRepo } from "../../services/gitHubTypes";
import { MarkdownView } from "./MarkdownView";

/**
 * Code tab: browse a repo's tree at a chosen ref, open files, and read the
 * rendered README at the repo root (GitHub layout: tree first, README card
 * below). Parent folder is a real row so navigation never traps the user.
 */

/** Rewrite relative markdown image/link URLs to raw.githubusercontent.com. */
function absolutize(md: string, base: string): string {
  return md.replace(
    /(!\[[^\]]*\]\()([^)\s]+)(\s+"[^"]*")?\)/g,
    (_m, pre, url, title) => {
      if (/^(https?:|data:)/i.test(url)) return `${pre}${url}${title || ""})`;
      return `${pre}${base}/${url.replace(/^\.\//, "")}${title || ""})`;
    }
  );
}

export function GitHubRepoCodeView({
  repo,
  refName,
  path,
  onOpenFile,
  onOpenPath,
}: {
  repo: GitHubRepo;
  refName: string;
  path: string;
  onOpenFile: (filePath: string) => void;
  onOpenPath: (nextPath: string) => void;
}) {
  const { theme } = useTheme();

  const tree = useGitHubResource(
    () => fetchContents(repo.owner, repo.name, path, refName),
    [repo.owner, repo.name, path, refName]
  );
  const readme = useGitHubResource(
    () => {
      const raw = `https://raw.githubusercontent.com/${repo.owner}/${repo.name}/${refName}`;
      return fetchReadme(repo.owner, repo.name, refName).then((res) =>
        res.ok ? { ok: true as const, data: absolutize(res.data, raw) } : res
      );
    },
    [repo.owner, repo.name, refName],
    { skip: !!path }
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

      {!path && (readme.loading && !readme.data ? (
        <LoadingState />
      ) : readme.data ? (
        <View style={[styles.readmeCard, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
          <View style={[styles.readmeHeader, { borderBottomColor: theme.border }]}>
            <Octicons name="book" size={13} color={theme.textSecondary} />
            <Text style={[styles.readmeTitle, { color: theme.textPrimary }]}>README.md</Text>
          </View>
          <MarkdownView source={readme.data} />
        </View>
      ) : null)}
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
  readmeCard: {
    margin: 12,
    padding: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  readmeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  readmeTitle: { fontSize: 12, fontWeight: "700" },
});