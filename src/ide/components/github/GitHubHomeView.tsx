import React, { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Image } from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { GitHubUserDetail } from "../../services/gitHubTypes";
import { fetchUserProfile, fetchNotifications } from "../../services/gitHubAccountService";
import { fetchMyRepos, fetchStarredRepos } from "../../services/gitHubRepoService";
import { useGitHubResource } from "./useGitHubResource";
import { ErrorState, LoadingState } from "./GitHubStates";
import { GitHubSearchBar } from "./GitHubControls";
import { GitHubNavigation } from "./useGitHubNavigation";
import { formatStale } from "../../services/gitHubProfileService";

/**
 * Landing screen of the GitHub surface: identity block, live counters,
 * quick actions, and the most recently touched repositories. Everything
 * here is one tap from the deeper screens.
 */

export function GitHubHomeView({
  nav,
  onCloneRepo,
  onSignOut,
  signedIn,
}: {
  nav: GitHubNavigation;
  onCloneRepo: (fullName: string) => void;
  onSignOut?: () => void;
  signedIn: boolean;
}) {
  const { theme } = useTheme();
  const [query, setQuery] = useState("");

  const profile = useGitHubResource<GitHubUserDetail>(
    () => fetchUserProfile(),
    [],
    { skip: !signedIn }
  );
  const repos = useGitHubResource(
    () => fetchMyRepos("updated", 6),
    [],
    { skip: !signedIn }
  );
  const starred = useGitHubResource(
    () => fetchStarredRepos(100),
    [],
    { skip: !signedIn }
  );
  const notifications = useGitHubResource(
    () => fetchNotifications({ limit: 50 }),
    [],
    { skip: !signedIn }
  );

  const openSearch = useCallback(
    (text: string) => {
      const q = text.trim();
      nav.push({ name: "search", query: q, scope: "repos" });
      setQuery("");
    },
    [nav]
  );

  const unread = (notifications.data || []).filter((n) => n.unread).length;
  const user = profile.data;

  return (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <GitHubSearchBar
        value={query}
        onChangeText={setQuery}
        onSubmit={openSearch}
        placeholder="Search repositories, code, users..."
      />

      {!signedIn ? (
        <View style={styles.section}>
          <Text style={[styles.note, { color: theme.textSecondary }]}>
            Sign in with GitHub to browse your repositories, issues, pull requests and notifications.
          </Text>
        </View>
      ) : profile.loading && !user ? (
        <LoadingState />
      ) : profile.error && !user ? (
        <ErrorState error={profile.error} onRetry={profile.refresh} />
      ) : (
        <>
          {user && (
            <TouchableOpacity
              style={[styles.identity, { borderBottomColor: theme.border }]}
              onPress={() => nav.push({ name: "profile", login: user.login })}
              activeOpacity={0.7}
            >
              {user.avatarUrl ? (
                <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: `${theme.accent}22` }]}>
                  <Octicons name="person" size={18} color={theme.accent} />
                </View>
              )}
              <View style={styles.identityText}>
                <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
                  {user.name || `@${user.login}`}
                </Text>
                <Text style={[styles.handle, { color: theme.textSecondary }]} numberOfLines={1}>
                  @{user.login}
                </Text>
              </View>
              <Octicons name="chevron-right" size={14} color={theme.textMuted} />
            </TouchableOpacity>
          )}

          <View style={[styles.stats, { borderBottomColor: theme.border }]}>
            <Counter label="Repos" value={user?.publicRepos ?? 0} onPress={() => nav.push({ name: "myRepos" })} />
            <Counter label="Starred" value={(starred.data || []).length} onPress={() => nav.push({ name: "starred" })} />
            <Counter label="Gists" value={user?.publicGists ?? 0} onPress={() => nav.push({ name: "gists" })} />
            <Counter
              label="Unread"
              value={unread}
              highlight={unread > 0}
              onPress={() => nav.push({ name: "notifications" })}
            />
          </View>

          <Section title="Quick actions">
            <Action icon="repo" label="My repositories" onPress={() => nav.push({ name: "myRepos" })} />
            <Action icon="plus" label="New repository" onPress={() => nav.push({ name: "newRepo" })} />
            <Action icon="issue-opened" label="Issues assigned to me" onPress={() => nav.push({ name: "search", query: "assignee:@me is:open", scope: "issues" })} />
            <Action icon="git-pull-request" label="Pull requests to review" onPress={() => nav.push({ name: "search", query: "review-requested:@me is:open", scope: "issues" })} />
            <Action icon="bell" label="Notifications" badge={unread} onPress={() => nav.push({ name: "notifications" })} />
            <Action icon="star" label="Starred repositories" onPress={() => nav.push({ name: "starred" })} />
            <Action icon="organization" label="Organizations" onPress={() => nav.push({ name: "orgs" })} />
            <Action icon="code-square" label="Search code" onPress={() => nav.push({ name: "search", scope: "code" })} />
            <Action icon="people" label="Search users" onPress={() => nav.push({ name: "search", scope: "users" })} />
            <Action icon="pencil" label="New gist" onPress={() => nav.push({ name: "newGist" })} />
            {onSignOut && (
              <Action icon="sign-out" label="Sign out of GitHub" destructive onPress={onSignOut} />
            )}
          </Section>

          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>RECENT REPOSITORIES</Text>
            <TouchableOpacity onPress={() => nav.push({ name: "myRepos" })}>
              <Text style={[styles.sectionLink, { color: theme.accent }]}>See all</Text>
            </TouchableOpacity>
          </View>

          {repos.loading && !repos.data ? (
            <LoadingState />
          ) : repos.error && !repos.data ? (
            <ErrorState error={repos.error} onRetry={repos.refresh} compact />
          ) : (repos.data || []).length === 0 ? (
            <Text style={[styles.note, { color: theme.textMuted }]}>No repositories yet.</Text>
          ) : (
            (repos.data || []).map((repo) => (
              <TouchableOpacity
                key={repo.id}
                style={[styles.recentRow, { borderBottomColor: theme.border }]}
                onPress={() => nav.push({ name: "repo", owner: repo.owner, repo: repo.name })}
                onLongPress={() => onCloneRepo(repo.fullName)}
                activeOpacity={0.7}
              >
                <View style={styles.recentBody}>
                  <Text style={[styles.recentName, { color: theme.textPrimary }]} numberOfLines={1}>
                    {repo.name}
                  </Text>
                  <Text style={[styles.recentMeta, { color: theme.textMuted }]} numberOfLines={1}>
                    {repo.language || "—"} · updated {formatStale(repo.updatedAt)}
                    {repo.isPrivate ? " · private" : ""}
                  </Text>
                </View>
                <Octicons name="chevron-right" size={13} color={theme.textMuted} />
              </TouchableOpacity>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

function Counter({
  label,
  value,
  onPress,
  highlight,
}: {
  label: string;
  value: number;
  onPress: () => void;
  highlight?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity style={styles.counter} onPress={onPress} activeOpacity={0.7}>
      <Text style={[styles.counterValue, { color: highlight ? theme.accentGold : theme.textPrimary }]}>
        {value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}
      </Text>
      <Text style={[styles.counterLabel, { color: theme.textMuted }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{title.toUpperCase()}</Text>
      </View>
      {children}
    </>
  );
}

function Action({
  icon,
  label,
  onPress,
  badge,
  destructive,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  badge?: number;
  destructive?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.actionRow, { borderBottomColor: theme.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Octicons name={icon as any} size={14} color={destructive ? theme.accentRed : theme.textSecondary} />
      <Text style={[styles.actionLabel, { color: destructive ? theme.accentRed : theme.textPrimary }]} numberOfLines={1}>
        {label}
      </Text>
      {!!badge && badge > 0 && <Text style={[styles.actionBadge, { color: theme.accentGold }]}>{badge}</Text>}
      <Octicons name="chevron-right" size={13} color={theme.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 12, paddingVertical: 8 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 6,
  },
  sectionTitle: { fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  sectionLink: { fontSize: 11.5, fontWeight: "700" },
  note: { fontSize: 12, lineHeight: 17, paddingHorizontal: 12, paddingVertical: 8 },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  identityText: { flex: 1, gap: 2 },
  avatar: { width: 38, height: 38, borderRadius: 19, marginRight: 10 },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  name: { fontSize: 14.5, fontWeight: "800" },
  handle: { fontSize: 12 },
  stats: { flexDirection: "row", paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  counter: { flex: 1, alignItems: "center", gap: 2 },
  counterValue: { fontSize: 15, fontWeight: "800" },
  counterLabel: { fontSize: 10 },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionLabel: { flex: 1, fontSize: 12.5 },
  actionBadge: { fontSize: 11, fontWeight: "800" },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  recentBody: { flex: 1, gap: 2 },
  recentName: { fontSize: 13, fontWeight: "700" },
  recentMeta: { fontSize: 10.5 },
});