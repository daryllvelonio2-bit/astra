import React from "react";
import { View, ScrollView, StyleSheet, Text } from "react-native";
import { useTheme } from "../../../theme/themeContext";
import { fetchMyRepos, fetchReposForOwner, fetchStarredRepos } from "../../services/gitHubRepoService";
import { useGitHubResource } from "./useGitHubResource";
import { EmptyState, ErrorState, LoadingState } from "./GitHubStates";
import { RepoRow } from "./GitHubRow";
import { GitHubNavigation } from "./useGitHubNavigation";

/**
 * Repository collections: mine, another user's/org's, or starred. One file
 * because the three are the same list with a different fetcher.
 */

export function GitHubRepoListView({
  nav,
  mode,
  owner,
  onCloneRepo,
  emptyText,
}: {
  nav: GitHubNavigation;
  mode: "mine" | "owner" | "starred";
  owner?: string;
  onCloneRepo: (fullName: string) => void;
  emptyText?: string;
}) {
  const { theme } = useTheme();

  const list = useGitHubResource(
    () =>
      mode === "mine"
        ? fetchMyRepos("updated", 100)
        : mode === "starred"
        ? fetchStarredRepos(100)
        : fetchReposForOwner(owner || "", 100),
    [mode, owner]
  );

  if (list.loading && !list.data) return <LoadingState />;
  if (list.error) return <ErrorState error={list.error} onRetry={list.refresh} />;
  if ((list.data || []).length === 0) {
    return (
      <EmptyState
        text={emptyText || (mode === "starred" ? "No starred repositories." : "No repositories found.")}
        hint={mode === "mine" ? "Create one from Quick actions on the home screen." : undefined}
      />
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.count, { color: theme.textMuted }]}>
        {list.data!.length} {list.data!.length === 1 ? "repository" : "repositories"}
      </Text>
      <ScrollView showsVerticalScrollIndicator={false}>
        {list.data!.map((repo) => (
          <RepoRow
            key={repo.id}
            repo={repo}
            showOwner={mode !== "mine"}
            onPress={() => nav.push({ name: "repo", owner: repo.owner, repo: repo.name })}
            onClone={repo.isPrivate ? undefined : () => onCloneRepo(repo.fullName)}
          />
        ))}
        <View style={{ height: 12 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  count: { fontSize: 10.5, paddingHorizontal: 12, paddingVertical: 7 },
});