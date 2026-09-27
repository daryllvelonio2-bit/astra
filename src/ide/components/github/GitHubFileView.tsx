import React, { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { fetchFileText } from "../../services/gitHubRepoService";
import { ghGet } from "../../services/gitHubApi";
import { useGitHubResource } from "./useGitHubResource";
import { ErrorState, LoadingState } from "./GitHubStates";
import { formatBytes } from "./GitHubRepoCodeView";
import { RepoCodeHeader } from "./GitHubRepoCodeHeader";

/**
 * Read-only file viewer. Shows the raw source with line numbers, plus the
 * commit that last touched the file (same banner github.com shows above a
 * file's contents). Editing a file on GitHub is a commit workflow, so the
 * editor sheet (with its own commit message) lives in GitHubFileEditor —
 * this view only reads.
 */

export function GitHubFileView({
  owner,
  repo,
  path,
  refName,
  onEdit,
  onOpenCommits,
}: {
  owner: string;
  repo: string;
  path: string;
  refName: string;
  onEdit?: (text: string, sha: string) => void;
  onOpenCommits?: () => void;
}) {
  const { theme } = useTheme();
  const [showAll, setShowAll] = useState(false);

  const file = useGitHubResource(
    () => fetchFileText(owner, repo, path, refName),
    [owner, repo, path, refName]
  );

  const meta = useGitHubResource(
    () => ghGet<any>(`/repos/${owner}/${repo}/contents/${path}`, { params: { ref: refName } }),
    [owner, repo, path, refName],
    { skip: false }
  );

  const loadFullText = useCallback(async () => {
    setShowAll(true);
  }, []);

  if (file.loading && !file.data) return <LoadingState />;
  if (file.error) return <ErrorState error={file.error} onRetry={file.refresh} />;
  if (!file.data) return null;

  const lines = file.data.text.split("\n");
  const visible = showAll ? lines : lines.slice(0, 400);
  const more = lines.length - visible.length;
  const sha = (meta.data as any)?.sha || "";

  return (
    <View style={styles.wrap}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Octicons name="file-code" size={13} color={theme.accent} />
        <Text style={[styles.headerPath, { color: theme.textPrimary }]} numberOfLines={1}>
          {path}
        </Text>
        <Text style={[styles.headerMeta, { color: theme.textMuted }]}>{formatBytes(file.data.size)}</Text>
      </View>

      {onEdit && !!sha && (
        <TouchableOpacity
          style={[styles.editRow, { borderBottomColor: theme.border }]}
          onPress={() => onEdit(file.data!.text, sha)}
          activeOpacity={0.7}
        >
          <Octicons name="pencil" size={12} color={theme.accent} />
          <Text style={[styles.editText, { color: theme.accent }]}>Edit this file on GitHub</Text>
        </TouchableOpacity>
      )}

      {onOpenCommits && (
        <RepoCodeHeader
          owner={owner}
          repo={repo}
          refName={refName}
          path={path}
          onOpenCommits={onOpenCommits}
        />
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <ScrollView showsVerticalScrollIndicator={false} style={styles.codeWrap}>
          {visible.map((line, index) => (
            <View key={index} style={styles.line}>
              <Text style={[styles.lineNo, { color: theme.textMuted }]}>{index + 1}</Text>
              <Text style={[styles.lineText, { color: theme.textPrimary }]}>{line || " "}</Text>
            </View>
          ))}
        </ScrollView>
      </ScrollView>

      {more > 0 && (
        <TouchableOpacity
          style={[styles.moreRow, { borderTopColor: theme.border }]}
          onPress={loadFullText}
          activeOpacity={0.8}
        >
          <Text style={[styles.moreText, { color: theme.accent }]}>Show {more} more lines</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerPath: { flex: 1, fontSize: 12, fontWeight: "700" },
  headerMeta: { fontSize: 10 },
  editRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  editText: { fontSize: 11.5, fontWeight: "600" },
  codeWrap: { paddingVertical: 6 },
  line: { flexDirection: "row", gap: 10, paddingHorizontal: 10 },
  lineNo: { fontSize: 10.5, minWidth: 34, textAlign: "right" },
  lineText: { fontSize: 11.5, fontFamily: "monospace" },
  moreRow: { paddingVertical: 10, alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth },
  moreText: { fontSize: 12, fontWeight: "700" },
});