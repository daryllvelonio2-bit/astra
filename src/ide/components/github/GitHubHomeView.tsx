import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useTheme } from "../../../theme/themeContext";
import { fetchNotifications } from "../../services/gitHubAccountService";
import { fetchStarredRepos } from "../../services/gitHubRepoService";
import { useGitHubResource } from "./useGitHubResource";
import { GitHubSearchBar } from "./GitHubControls";
import { GitHubNavigation } from "./useGitHubNavigation";
import { GitHubProfileBody, ProfileStat } from "./GitHubProfileBody";
import { GitHubHomeActions } from "./GitHubHomeActions";

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
        listClone={false}
        showList={false}
      >
        <GitHubHomeActions nav={nav} login={login} onSignOut={onSignOut} />
      </GitHubProfileBody>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  note: { fontSize: 12, lineHeight: 17, paddingHorizontal: 12, paddingVertical: 8 },
});