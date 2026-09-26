import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { GitHubSearchBar, FilterStrip } from "./GitHubControls";
import { RepoRow, UserRow } from "./GitHubRow";
import { EmptyState, ErrorState, LoadingState } from "./GitHubStates";
import { GitHubNavigation } from "./useGitHubNavigation";
import { searchCode, searchRepos, searchUsers } from "../../services/gitHubSearchApi";
import { fetchIssues } from "../../services/gitHubIssueService";
import { mapGitHubRepo } from "../../services/gitHubRepoService";
import { GitHubApiError, GitHubResult } from "../../services/gitHubApi";
import { GitHubCodeSearchItem, GitHubIssue, GitHubRepo, GitHubUserSummary } from "../../services/gitHubTypes";

/**
 * Unified GitHub search. One field, four scopes (repos, code, issues,
 * users) — the scope tabs keep the same query so you can pivot from a repo
 * name to its code without retyping. Debounced; stale results dropped.
 */

type Scope = "repos" | "code" | "issues" | "users";

const DEBOUNCE_MS = 450;

export function GitHubSearchView({
  nav,
  initialQuery,
  initialScope,
  onCloneRepo,
}: {
  nav: GitHubNavigation;
  initialQuery?: string;
  initialScope?: Scope;
  onCloneRepo: (fullName: string) => void;
}) {
  const { theme } = useTheme();
  const [query, setQuery] = useState(initialQuery || "");
  const [scope, setScope] = useState<Scope>(initialScope || "repos");
  const [items, setItems] = useState<RepoResult>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<GitHubApiError | null>(null);
  const seq = useRef(0);

  const run = useCallback(
    async (text: string, activeScope: Scope) => {
      const q = text.trim();
      if (!q) {
        setItems(null);
        setError(null);
        setLoading(false);
        return;
      }
      const current = ++seq.current;
      setLoading(true);
      setError(null);
      const res = await fetchForScope(activeScope, q);
      if (current !== seq.current) return;
      if (res.ok) {
        setItems({ scope: activeScope, value: res.data as any });
        setError(null);
      } else {
        setError(res.error);
      }
      setLoading(false);
    },
    []
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void run(query, scope);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, scope, run]);

  const results = items && items.scope === scope ? (items.value as any[]) : [];

  return (
    <View style={styles.wrap}>
      <GitHubSearchBar
        value={query}
        onChangeText={setQuery}
        onSubmit={(text) => void run(text, scope)}
        placeholder={placeholderFor(scope)}
        autoFocus={!initialQuery}
      />

      <FilterStrip<Scope>
        options={[
          { key: "repos", label: "Repositories" },
          { key: "code", label: "Code" },
          { key: "issues", label: "Issues & PRs" },
          { key: "users", label: "Users" },
        ]}
        value={scope}
        onChange={setScope}
      />

      {hintFor(scope) && (
        <Text style={[styles.hint, { color: theme.textMuted }]}>{hintFor(scope)}</Text>
      )}

      {loading && <LoadingState />}
      {!loading && error && <ErrorState error={error} onRetry={() => void run(query, scope)} />}
      {!loading && !error && !query.trim() && (
        <EmptyState text="Type to search GitHub" hint={hintFor(scope)} />
      )}
      {!loading && !error && !!query.trim() && results.length === 0 && (
        <EmptyState text={`No ${scope} matched that search.`} />
      )}

      {!loading && results.length > 0 && (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {scope === "repos" &&
            (results as GitHubRepo[]).map((repo) => (
              <RepoRow
                key={repo.id}
                repo={repo}
                showOwner
                onPress={() => nav.push({ name: "repo", owner: repo.owner, repo: repo.name })}
                onClone={repo.isPrivate ? undefined : () => onCloneRepo(repo.fullName)}
              />
            ))}

          {scope === "code" &&
            (results as GitHubCodeSearchItem[]).map((item) => (
              <TouchableOpacity
                key={`${item.repoFullName}-${item.path}`}
                style={[styles.codeRow, { borderBottomColor: theme.border }]}
                onPress={() => {
                  const [owner, repo] = item.repoFullName.split("/");
                  nav.push({ name: "file", owner, repo, path: item.path });
                }}
                activeOpacity={0.7}
              >
                <Octicons name="file-code" size={13} color={theme.accent} />
                <View style={styles.codeBody}>
                  <Text style={[styles.codePath, { color: theme.textPrimary }]} numberOfLines={1}>
                    {item.path.split("/").pop()}
                  </Text>
                  <Text style={[styles.codeRepo, { color: theme.textSecondary }]} numberOfLines={1}>
                    {item.repoFullName}/{item.path}
                  </Text>
                  {item.fragments.slice(0, 1).map((fragment, i) => (
                    <Text key={i} style={[styles.codeFragment, { color: theme.textMuted }]} numberOfLines={2}>
                      {fragment.replace(/\s+/g, " ").trim()}
                    </Text>
                  ))}
                </View>
              </TouchableOpacity>
            ))}

          {scope === "issues" &&
            (results as GitHubIssue[]).map((issue) => {
              const [owner, repo] = issue.repoFullName.split("/");
              return (
                <TouchableOpacity
                  key={`${issue.repoFullName}-${issue.number}`}
                  style={[styles.codeRow, { borderBottomColor: theme.border }]}
                  onPress={() =>
                    owner && repo
                      ? nav.push({ name: "issue", owner, repo, number: issue.number, isPull: issue.isPullRequest })
                      : undefined
                  }
                  activeOpacity={0.7}
                >
                  <Octicons
                    name={issue.isPullRequest ? "git-pull-request" : "issue-opened"}
                    size={13}
                    color={issue.isPullRequest ? theme.accentGreen : theme.accentGold}
                  />
                  <View style={styles.codeBody}>
                    <Text style={[styles.codePath, { color: theme.textPrimary }]} numberOfLines={2}>
                      {issue.title}
                    </Text>
                    <Text style={[styles.codeRepo, { color: theme.textSecondary }]} numberOfLines={1}>
                      {issue.repoFullName} #{issue.number} · {issue.state}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}

          {scope === "users" &&
            (results as GitHubUserSummary[]).map((user) => (
              <UserRow key={user.login} user={user} onPress={() => nav.push({ name: "profile", login: user.login })} />
            ))}
        </ScrollView>
      )}
    </View>
  );
}

type RepoResult =
  | { scope: Scope; value: GitHubRepo[] | GitHubCodeSearchItem[] | GitHubIssue[] | GitHubUserSummary[] }
  | null;

async function fetchForScope(scope: Scope, query: string): Promise<GitHubResult<any[]>> {
  if (scope === "repos") {
    const res = await searchRepos(query, { perPage: 40 });
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, data: res.data.items.map(mapGitHubRepo) } as GitHubResult<any[]>;
  }
  if (scope === "code") return searchCode(query, 40);
  if (scope === "users") return searchUsers(query, 40);
  const res = await fetchIssues("", "", { query, state: "all", limit: 40, sort: "updated" });
  return res;
}

function placeholderFor(scope: Scope): string {
  switch (scope) {
    case "code":
      return "Search code, e.g. useState language:ts";
    case "issues":
      return "Search issues and PRs...";
    case "users":
      return "Search users and organizations...";
    default:
      return "Search repositories...";
  }
}

function hintFor(scope: Scope): string {
  switch (scope) {
    case "code":
      return "Requires a signed-in token with repo scope. Qualifiers like org:, language:, path: work here.";
    case "issues":
      return "Qualifiers work: is:open label:bug author:me org:foo";
    case "repos":
      return "Qualifiers work: stars:>100 language:ts org:foo topic:cli";
    default:
      return "";
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  hint: { fontSize: 10.5, paddingHorizontal: 12, paddingTop: 6, lineHeight: 14 },
  list: { flex: 1 },
  codeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  codeBody: { flex: 1, gap: 2 },
  codePath: { fontSize: 12.5, fontWeight: "700" },
  codeRepo: { fontSize: 10.5 },
  codeFragment: { fontSize: 10.5, lineHeight: 14, fontStyle: "italic" },
});