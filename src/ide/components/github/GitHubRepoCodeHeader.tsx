import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { fetchCommits } from "../../services/gitHubRepoService";
import { useGitHubResource } from "./useGitHubResource";
import { GitHubCommitSummary } from "../../services/gitHubTypes";
import { formatStale } from "../../services/gitHubProfileService";

/**
 * The toolbar above the code tree, mirroring github.com: the branch selector
 * on the left (the tree's context), then the latest commit for the current
 * path — author avatar, first line of the message, relative time, short sha.
 * Tapping the commit area pushes the commits screen for this path.
 */

export function useLatestCommit(
  owner: string,
  repo: string,
  refName: string,
  path: string,
  limit = 1
): { commit: GitHubCommitSummary | null; loading: boolean; refresh: () => void } {
  const res = useGitHubResource(
    () => fetchCommits(owner, repo, { ref: refName, path: path || undefined, limit }),
    [owner, repo, refName, path]
  );
  return {
    commit: res.data && res.data.length > 0 ? res.data[0] : null,
    loading: res.loading,
    refresh: res.refresh,
  };
}

export function RepoCodeHeader({
  owner,
  repo,
  refName,
  path,
  onOpenCommits,
  onOpenBranches,
}: {
  owner: string;
  repo: string;
  refName: string;
  path: string;
  onOpenCommits?: () => void;
  onOpenBranches?: () => void;
}) {
  const { theme } = useTheme();
  const { commit, loading } = useLatestCommit(owner, repo, refName, path);
  const title = commit ? firstLine(commit.message) : "";
  const when = commit ? formatStale(commit.date) : "";

  return (
    <View style={[styles.wrap, { borderBottomColor: theme.border, backgroundColor: theme.bgSecondary }]}>
      {!!onOpenBranches && (
        <>
          <TouchableOpacity
            style={[styles.branchChip, { borderColor: theme.border, backgroundColor: theme.bgTertiary }]}
            onPress={onOpenBranches}
            activeOpacity={0.7}
          >
            <Octicons name="git-branch" size={10} color={theme.textSecondary} />
            <Text style={[styles.branchText, { color: theme.textPrimary }]} numberOfLines={1}>
              {refName}
            </Text>
            <Octicons name="chevron-down" size={10} color={theme.textMuted} />
          </TouchableOpacity>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
        </>
      )}

      <TouchableOpacity
        style={styles.commitArea}
        onPress={onOpenCommits}
        activeOpacity={0.7}
        disabled={!commit || !onOpenCommits}
      >
        <View style={styles.left}>
          {commit?.authorAvatar ? (
            <Image source={{ uri: commit.authorAvatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.accent }]}>
              <Text style={styles.avatarLetter}>
                {(commit?.authorLogin || commit?.authorName || "?").slice(0, 1).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.body}>
            {loading && !commit ? (
              <ActivityIndicator size="small" color={theme.accent} />
            ) : commit ? (
              <>
                <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>
                  {title}
                </Text>
                <View style={styles.meta}>
                  <Text style={[styles.metaText, { color: theme.textSecondary }]} numberOfLines={1}>
                    {commit.authorLogin || commit.authorName || "unknown"}
                  </Text>
                  <Text style={[styles.metaText, { color: theme.textMuted }]} numberOfLines={1}>
                    authored {when}
                  </Text>
                </View>
              </>
            ) : (
              <Text style={[styles.metaText, { color: theme.textMuted }]}>No commits yet.</Text>
            )}
          </View>
        </View>
        {!!commit && (
          <View style={styles.right}>
            <Octicons name="git-commit" size={11} color={theme.textMuted} />
            <Text style={[styles.sha, { color: theme.textMuted }]}>{commit.shortSha}</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

function firstLine(msg: string): string {
  if (!msg) return "";
  const lf = msg.indexOf("\n");
  return lf >= 0 ? msg.slice(0, lf) : msg;
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  branchChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: 108,
    height: 24,
    paddingHorizontal: 7,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  branchText: { fontSize: 10.5, fontWeight: "700", flexShrink: 1 },
  divider: { width: StyleSheet.hairlineWidth, alignSelf: "stretch", marginVertical: 1 },
  commitArea: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
  left: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
  avatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#333" },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarLetter: { color: "#fff", fontSize: 10, fontWeight: "800" },
  body: { flex: 1, gap: 1, minWidth: 0 },
  title: { fontSize: 12, fontWeight: "700" },
  meta: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { fontSize: 10 },
  right: { flexDirection: "row", alignItems: "center", gap: 4 },
  sha: { fontSize: 10.5, fontWeight: "700", fontFamily: "monospace" as any },
});
