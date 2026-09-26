import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useTheme } from "../../../theme/themeContext";
import { fetchIssues } from "../../services/gitHubIssueService";
import { fetchPulls } from "../../services/gitHubPullService";
import { GitHubResult } from "../../services/gitHubApi";
import { useGitHubResource } from "./useGitHubResource";
import { EmptyState, ErrorState, LoadingState } from "./GitHubStates";
import { FilterStrip, GitHubSearchBar } from "./GitHubControls";
import { IssueRow, PullRow } from "./GitHubRow";
import { GitHubNavigation, IssueMode, PullFilter } from "./useGitHubNavigation";

/**
 * Issues tab: issue list and PR list share one file because they share the
 * same filters and row shapes. Counts come from a parallel fetch so the
 * tabs read "Open 12 / Closed 340" like the web UI.
 */

const DEBOUNCE_MS = 450;

export function GitHubIssueListView({
  owner,
  repo,
  nav,
  login,
  initialMode = "open",
  isPull,
}: {
  owner: string;
  repo: string;
  nav: GitHubNavigation;
  login?: string;
  initialMode?: IssueMode;
  isPull?: boolean;
}) {
  const { theme } = useTheme();
  const [mode, setMode] = useState<IssueMode>(initialMode);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const list = useGitHubResource<any[]>(
    async () => {
      const res = isPull
        ? await fetchPulls(owner, repo, pullOptionsFor(mode as PullFilter, login, debounced))
        : await fetchIssues(owner, repo, issueOptionsFor(mode, login, debounced));
      return (res.ok
        ? { ok: true, data: res.data }
        : { ok: false, error: res.error }) as GitHubResult<any[]>;
    },
    [owner, repo, mode, login, debounced, isPull]
  );

  const counts = useGitHubResource<any[]>(
    async () => {
      const res = isPull
        ? await fetchPulls(owner, repo, { state: "all", limit: 100 })
        : await fetchIssues(owner, repo, { state: "all", limit: 100 });
      return (res.ok
        ? { ok: true, data: res.data }
        : { ok: false, error: res.error }) as GitHubResult<any[]>;
    },
    [owner, repo, isPull]
  );

  const openCount = (counts.data || []).filter((x: any) => x.state === "open").length;
  const closedCount = (counts.data || []).length - openCount;

  const onSelect = useCallback(
    (number: number) => nav.push({ name: "issue", owner, repo, number, isPull: !!isPull }),
    [nav, owner, repo, isPull]
  );

  const options = isPull
    ? [
        { key: "open" as PullFilter, label: "Open", count: openCount },
        { key: "closed" as PullFilter, label: "Closed", count: closedCount },
        { key: "mine" as PullFilter, label: "Created by me" },
        { key: "review" as PullFilter, label: "Review requested" },
      ]
    : [
        { key: "open" as IssueMode, label: "Open", count: openCount },
        { key: "closed" as IssueMode, label: "Closed", count: closedCount },
        { key: "mine" as IssueMode, label: "Created by me" },
        { key: "assigned" as IssueMode, label: "Assigned to me" },
        { key: "mentioned" as IssueMode, label: "Mentioned" },
      ];

  return (
    <View style={styles.wrap}>
      <GitHubSearchBar
        value={query}
        onChangeText={setQuery}
        placeholder={`Search ${isPull ? "pull requests" : "issues"}...`}
      />
      <FilterStrip
        options={options as any}
        value={mode}
        onChange={(key) => setMode(key as IssueMode)}
      />

      {list.loading && !list.data ? (
        <LoadingState />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={list.refresh} />
      ) : (list.data || []).length === 0 ? (
        <EmptyState
          text={`No ${isPull ? "pull requests" : "issues"} match this filter.`}
          hint={
            (mode as string) === "mine" || (mode as string) === "assigned" || (mode as string) === "review"
              ? "These filters need a signed-in account."
              : undefined
          }
        />
      ) : (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {isPull
            ? (list.data as any[]).map((pull) => (
                <PullRow key={pull.number} pull={pull} onPress={() => onSelect(pull.number)} />
              ))
            : (list.data as any[]).map((issue) => (
                <IssueRow key={issue.number} issue={issue} onPress={() => onSelect(issue.number)} />
              ))}
        </ScrollView>
      )}
    </View>
  );
}

function issueOptionsFor(mode: IssueMode, login: string | undefined, query: string) {
  const base = { query, limit: 50 as const };
  switch (mode) {
    case "closed":
      return { ...base, state: "closed" as const };
    case "mine":
      return { ...base, state: "all" as const, creator: login };
    case "assigned":
      return { ...base, state: "open" as const, assignee: login };
    case "mentioned":
      return { ...base, state: "all" as const, query: `${query} mentions:${login || ""}`.trim() };
    default:
      return { ...base, state: "open" as const };
  }
}

function pullOptionsFor(mode: PullFilter, login: string | undefined, query: string) {
  switch (mode) {
    case "closed":
      return { state: "closed" as const, limit: 50 };
    case "mine":
      return { state: "all" as const, mineOnly: true, login, limit: 50 };
    case "review":
      return { state: "open" as const, reviewRequested: true, login, limit: 50 };
    default:
      return { state: "open" as const, limit: 50 };
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  list: { flex: 1 },
});