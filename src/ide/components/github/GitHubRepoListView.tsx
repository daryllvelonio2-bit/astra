import React, { useState } from "react";
import { View, ScrollView, StyleSheet, Text, TouchableOpacity } from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { fetchMyRepos, fetchReposForOwner, fetchStarredRepos } from "../../services/gitHubRepoService";
import { useGitHubResource } from "./useGitHubResource";
import { EmptyState, ErrorState, LoadingState } from "./GitHubStates";
import { RepoRow } from "./GitHubRow";
import { GitHubNavigation } from "./useGitHubNavigation";
import { GitHubRepo } from "../../services/gitHubTypes";
import { formatStale } from "../../services/gitHubProfileService";

/**
 * Repository collections: mine, another user's/org's, or starred. One file
 * because the three are the same list with a different fetcher. The "mine"
 * mode adds a sort toggle (Last updated / Name) so the surface mirrors the
 * github.com repository list.
 */

type SortMode = "updated" | "pushed" | "name";

const SORTS: Array<{ key: SortMode; label: string }> = [
  { key: "updated", label: "Last updated" },
  { key: "pushed", label: "Recently pushed" },
  { key: "name", label: "Name" },
];

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
  const [sort, setSort] = useState<SortMode>("updated");

  const list = useGitHubResource(
    () =>
      mode === "mine"
        ? fetchMyRepos(sort === "name" ? "full_name" : sort, 100)
        : mode === "starred"
        ? fetchStarredRepos(100)
        : fetchReposForOwner(owner || "", 100),
    [mode, owner, sort]
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

  const repos = list.data || [];
  const latest = sortedLatestPushed(repos);

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <Text style={[styles.count, { color: theme.textMuted }]}>
          {repos.length} {repos.length === 1 ? "repository" : "repositories"}
        </Text>
        {mode === "mine" && (
          <View style={[styles.sortRow, { borderColor: theme.border }]}>
            {SORTS.map((s) => {
              const active = s.key === sort;
              return (
                <TouchableOpacity
                  key={s.key}
                  style={[
                    styles.sortChip,
                    active && { backgroundColor: `${theme.accent}20`, borderColor: theme.accent },
                  ]}
                  onPress={() => setSort(s.key)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[styles.sortChipText, { color: active ? theme.accent : theme.textMuted }]}
                  >
                    {s.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
      {mode === "mine" && latest && (
        <View style={[styles.latestRow, { borderBottomColor: theme.border }]}>
          <Octicons name="broadcast" size={10} color={theme.textMuted} />
          <Text style={[styles.latestText, { color: theme.textMuted }]} numberOfLines={1}>
            Latest activity on <Text style={{ color: theme.textSecondary, fontWeight: "700" }}>{latest.name}</Text>
            {" · "}
            {formatStale(latest.pushedAt || latest.updatedAt)}
          </Text>
        </View>
      )}
      <ScrollView showsVerticalScrollIndicator={false}>
        {repos.map((repo) => (
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

function sortedLatestPushed(repos: GitHubRepo[]): GitHubRepo | null {
  let best: GitHubRepo | null = null;
  let bestTime = -1;
  for (const r of repos) {
    const iso = r.pushedAt || r.updatedAt;
    if (!iso) continue;
    const t = new Date(iso).getTime();
    if (Number.isFinite(t) && t > bestTime) {
      best = r;
      bestTime = t;
    }
  }
  return best;
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  topRow: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4, gap: 6 },
  count: { fontSize: 10.5 },
  sortRow: {
    flexDirection: "row",
    gap: 4,
    flexWrap: "wrap",
  },
  sortChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
  },
  sortChipText: { fontSize: 10, fontWeight: "700" },
  latestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  latestText: { fontSize: 10.5 },
});
