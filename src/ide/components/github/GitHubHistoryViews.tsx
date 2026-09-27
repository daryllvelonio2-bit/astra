import React, { useState } from "react";
import { View, Text, Image, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Octicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useTheme } from "../../../theme/themeContext";
import { fetchBranches, fetchCommits, fetchCommit } from "../../services/gitHubRepoService";
import { useGitHubResource } from "./useGitHubResource";
import { EmptyState, ErrorState, LoadingState } from "./GitHubStates";
import { GitHubFileDiff } from "./GitHubFileDiff";
import { GitHubNavigation } from "./useGitHubNavigation";
import { formatStale } from "../../services/gitHubProfileService";
import { GitHubBranchInfo } from "../../services/gitHubTypes";

/**
 * Commits list + single commit detail, and the branch picker. These are
 * read-only views of repository history; the local working tree stays the
 * place where checkout happens.
 */

export function GitHubCommitsView({
  owner,
  repo,
  ref,
  path,
  nav,
}: {
  owner: string;
  repo: string;
  ref?: string;
  path?: string;
  nav: GitHubNavigation;
}) {
  const { theme } = useTheme();
  const commits = useGitHubResource(
    () => fetchCommits(owner, repo, { ref, path, limit: 60 }),
    [owner, repo, ref, path]
  );

  if (commits.loading && !commits.data) return <LoadingState />;
  if (commits.error) return <ErrorState error={commits.error} onRetry={commits.refresh} />;
  if ((commits.data || []).length === 0) return <EmptyState text="No commits." />;

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {(commits.data || []).map((c) => (
        <TouchableOpacity
          key={c.sha}
          style={[styles.row, { borderBottomColor: theme.border }]}
          onPress={() => nav.push({ name: "commit", owner, repo, sha: c.sha })}
          activeOpacity={0.7}
        >
          <View style={styles.commitBody}>
            <Text style={[styles.commitMessage, { color: theme.textPrimary }]} numberOfLines={2}>
              {c.message}
            </Text>
            <View style={styles.commitMeta}>
              {!!c.authorAvatar && (
                <Image source={{ uri: c.authorAvatar }} style={styles.miniAvatar} />
              )}
              <Text style={[styles.metaText, { color: theme.textMuted }]}>
                {c.authorName} · {formatStale(c.date)} · {c.shortSha}
              </Text>
            </View>
          </View>
          <Octicons name="chevron-right" size={12} color={theme.textMuted} />
        </TouchableOpacity>
      ))}
      <View style={{ height: 12 }} />
    </ScrollView>
  );
}

export function GitHubCommitDetailView({ owner, repo, sha }: { owner: string; repo: string; sha: string }) {
  const { theme } = useTheme();
  const commit = useGitHubResource(() => fetchCommit(owner, repo, sha), [owner, repo, sha]);

  if (commit.loading && !commit.data) return <LoadingState />;
  if (commit.error) return <ErrorState error={commit.error} onRetry={commit.refresh} />;
  if (!commit.data) return null;

  const c = commit.data;
  const fileWord = c.files === 1 ? "changed file" : "changed files";
  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.commitMessage, { color: theme.textPrimary }]}>{c.message}</Text>
        <View style={styles.commitMeta}>
          <Text style={[styles.metaText, { color: theme.textMuted }]}>
            {c.authorName} committed {formatStale(c.date)} · {c.shortSha}
          </Text>
        </View>
        <View style={styles.commitMeta}>
          <Text style={[styles.metaText, { color: theme.textMuted }]}>
            Showing {c.files} {fileWord} with
          </Text>
          <Text style={[styles.stat, { color: theme.accentGreen }]}>
            {c.additions} addition{c.additions === 1 ? "" : "s"}
          </Text>
          <Text style={[styles.metaText, { color: theme.textMuted }]}>and</Text>
          <Text style={[styles.stat, { color: theme.accentRed }]}>
            {c.deletions} deletion{c.deletions === 1 ? "" : "s"}
          </Text>
        </View>
      </View>
      <GitHubFileDiff
        file={{
          filename: "Changes",
          status: "modified",
          additions: c.additions,
          deletions: c.deletions,
          changes: c.additions + c.deletions,
          patch: c.patch,
        }}
      />
    </ScrollView>
  );
}

export function GitHubBranchesView({
  owner,
  repo,
  current,
  onPick,
}: {
  owner: string;
  repo: string;
  current: string;
  onPick: (branch: string) => void;
}) {
  const { theme } = useTheme();
  const branches = useGitHubResource(() => fetchBranches(owner, repo, 100), [owner, repo]);

  if (branches.loading && !branches.data) return <LoadingState />;
  if (branches.error) return <ErrorState error={branches.error} onRetry={branches.refresh} />;
  if ((branches.data || []).length === 0) return <EmptyState text="No branches found." />;

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {(branches.data || []).map((branch: GitHubBranchInfo) => {
        const isCurrent = branch.name === current;
        return (
          <TouchableOpacity
            key={branch.name}
            style={[styles.row, { borderBottomColor: theme.border }]}
            onPress={() => onPick(branch.name)}
            activeOpacity={0.7}
          >
            <Octicons name={isCurrent ? "check" : "git-branch"} size={13} color={isCurrent ? theme.accent : theme.textMuted} />
            <Text style={[styles.branchName, { color: theme.textPrimary }]} numberOfLines={1}>
              {branch.name}
            </Text>
            {branch.isProtected && <Octicons name="shield-lock" size={11} color={theme.accentGold} />}
            <Text style={[styles.metaText, { color: theme.textMuted }]}>{branch.sha.slice(0, 7)}</Text>
          </TouchableOpacity>
        );
      })}
      <View style={{ height: 12 }} />
    </ScrollView>
  );
}

/** Opens the remote page for anything we can't render natively. */
export function openGitHubUrl(url: string): void {
  if (url) WebBrowser.openBrowserAsync(url).catch(() => {});
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
  commitBody: { flex: 1, gap: 2 },
  commitMessage: { fontSize: 12.5, fontWeight: "600", lineHeight: 17 },
  commitMeta: { flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" },
  miniAvatar: { width: 16, height: 16, borderRadius: 8, backgroundColor: "#333" },
  metaText: { fontSize: 10.5 },
  stat: { fontSize: 10.5, fontWeight: "700" },
  header: { paddingHorizontal: 12, paddingVertical: 10, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  branchName: { flex: 1, fontSize: 12.5, fontWeight: "600" },
});
