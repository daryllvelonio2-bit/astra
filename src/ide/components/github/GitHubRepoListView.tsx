import React from "react";
import { View, ScrollView, StyleSheet } from "react-native";
import { fetchMyRepos, fetchReposForOwner, fetchStarredRepos } from "../../services/gitHubRepoService";
import { useGitHubResource } from "./useGitHubResource";
import { EmptyState, ErrorState, LoadingState } from "./GitHubStates";
import { RepoRow } from "./GitHubRow";
import { GitHubNavigation } from "./useGitHubNavigation";

/**
 * Repository collections: mine, another user's/org's, or starred. One file
 * because the three are the same list with a different fetcher.
 *
 * Deliberately bare: no count line, sort chips or "latest activity" banner —
 * the rows are the surface. Clone is only offered when the caller passes a
 * handler (the repo screen's own ⋯ menu owns cloning).
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
  onCloneRepo?: (fullName: string) => void;
  emptyText?: string;
}) {
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
        hint={
          mode === "mine"
            ? "Create one from Home > Quick Actions > New repository."
            : undefined
        }
      />
    );
  }

  const repos = list.data || [];
  const canClone = !!onCloneRepo && mode !== "owner";

  return (
    <View style={styles.wrap}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {repos.map((repo) => (
          <RepoRow
            key={repo.id}
            repo={repo}
            showOwner={mode !== "mine"}
            onPress={() => nav.push({ name: "repo", owner: repo.owner, repo: repo.name })}
            onClone={
              canClone && !repo.isPrivate ? () => onCloneRepo!(repo.fullName) : undefined
            }
          />
        ))}
        <View style={{ height: 12 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
});
