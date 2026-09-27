import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { fetchNotifications } from "../../services/gitHubAccountService";
import { fetchStarredRepos } from "../../services/gitHubRepoService";
import { useGitHubResource } from "./useGitHubResource";
import { GitHubSearchBar } from "./GitHubControls";
import { GitHubNavigation } from "./useGitHubNavigation";
import { GitHubProfileBody, ProfileStat } from "./GitHubProfileBody";

/**
 * Landing screen: search, then your own profile — the same surface the profile
 * route renders (GitHubProfileBody), so the two can no longer drift. Home adds
 * only what is its own: the Starred and Unread counters, and its shortcuts.
 *
 * The whole profile body is the page (fixed header + tabs + a scrolling list
 * area) rather than a stack of sections inside one ScrollView: the list views
 * own a ScrollView, so they need a bounded flex parent — nesting them in a page
 * scroll would also drop list virtualization.
 */
export function GitHubHomeView({
  nav,
  login,
  signedIn,
  onSignOut,
  onCloneRepo,
}: {
  nav: GitHubNavigation;
  login?: string;
  signedIn: boolean;
  onSignOut?: () => void;
  onCloneRepo: (fullName: string) => void;
}) {
  const { theme } = useTheme();
  const [query, setQuery] = useState("");

  const starred = useGitHubResource(() => fetchStarredRepos(100), [], { skip: !signedIn });
  const notifications = useGitHubResource(() => fetchNotifications({ limit: 50 }), [], { skip: !signedIn });
  const unread = (notifications.data || []).filter((n) => n.unread).length;

  const openSearch = useCallback(
    (text: string) => {
      nav.push({ name: "search", query: text.trim(), scope: "repos" });
      setQuery("");
    },
    [nav]
  );

  if (!signedIn || !login) {
    return (
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <GitHubSearchBar
          value={query}
          onChangeText={setQuery}
          onSubmit={openSearch}
          placeholder="Search repositories, code, users..."
        />
        <Text style={[styles.note, { color: theme.textSecondary }]}>
          Sign in with GitHub to browse your repositories, issues, pull requests and notifications.
        </Text>
      </ScrollView>
    );
  }

  const homeStats: ProfileStat[] = [
    {
      label: "Starred",
      value: (starred.data || []).length,
      onPress: () => nav.push({ name: "starred" }),
    },
    {
      label: "Unread",
      value: unread,
      highlight: unread > 0,
      onPress: () => nav.push({ name: "notifications" }),
    },
  ];

  return (
    <View style={styles.wrap}>
      <GitHubSearchBar
        value={query}
        onChangeText={setQuery}
        onSubmit={openSearch}
        placeholder="Search repositories, code, users..."
      />
      <GitHubProfileBody
        login={login}
        nav={nav}
        onCloneRepo={onCloneRepo}
        reposMode="mine"
        extraStats={homeStats}
        showContribGraph
        headerSlot={<ShortcutRow nav={nav} unread={unread} onSignOut={onSignOut} />}
      />
    </View>
  );
}

type Shortcut = {
  icon: string;
  label: string;
  badge?: number;
  destructive?: boolean;
  onPress: () => void;
};

/**
 * Home's shortcuts as one horizontally scrolling chip row instead of eleven
 * stacked rows: same actions, one line of height.
 */
function ShortcutRow({
  nav,
  unread,
  onSignOut,
}: {
  nav: GitHubNavigation;
  unread: number;
  onSignOut?: () => void;
}) {
  const { theme } = useTheme();

  const shortcuts: Shortcut[] = [
    { icon: "repo", label: "My repositories", onPress: () => nav.push({ name: "myRepos" }) },
    { icon: "star", label: "Starred", onPress: () => nav.push({ name: "starred" }) },
    { icon: "plus", label: "New repository", onPress: () => nav.push({ name: "newRepo" }) },
    {
      icon: "issue-opened",
      label: "Assigned to me",
      onPress: () => nav.push({ name: "search", query: "assignee:@me is:open", scope: "issues" }),
    },
    {
      icon: "git-pull-request",
      label: "To review",
      onPress: () => nav.push({ name: "search", query: "review-requested:@me is:open", scope: "issues" }),
    },
    { icon: "bell", label: "Notifications", badge: unread, onPress: () => nav.push({ name: "notifications" }) },
    { icon: "organization", label: "Organizations", onPress: () => nav.push({ name: "orgs" }) },
    { icon: "code-square", label: "Search code", onPress: () => nav.push({ name: "search", scope: "code" }) },
    { icon: "people", label: "Search users", onPress: () => nav.push({ name: "search", scope: "users" }) },
    { icon: "pencil", label: "New gist", onPress: () => nav.push({ name: "newGist" }) },
  ];
  if (onSignOut) shortcuts.push({ icon: "sign-out", label: "Sign out", destructive: true, onPress: onSignOut });

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.shortcutScroll}
      contentContainerStyle={styles.shortcutRow}
    >
      {shortcuts.map((s) => (
        <TouchableOpacity
          key={s.label}
          style={[styles.chip, { backgroundColor: theme.bgTertiary, borderColor: theme.border }]}
          onPress={s.onPress}
          activeOpacity={0.7}
          accessibilityLabel={s.label}
        >
          <Octicons
            name={s.icon as any}
            size={11}
            color={s.destructive ? theme.accentRed : theme.textSecondary}
          />
          <Text
            style={[styles.chipText, { color: s.destructive ? theme.accentRed : theme.textSecondary }]}
            numberOfLines={1}
          >
            {s.label}
          </Text>
          {!!s.badge && s.badge > 0 && <Text style={[styles.chipBadge, { color: theme.accentGold }]}>{s.badge}</Text>}
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  note: { fontSize: 12, lineHeight: 17, paddingHorizontal: 12, paddingVertical: 8 },
  shortcutScroll: { flexGrow: 0 },
  shortcutRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontSize: 10.5, fontWeight: "600" },
  chipBadge: { fontSize: 10, fontWeight: "800" },
});