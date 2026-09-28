import React from "react";
import { TouchableOpacity, StyleSheet } from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { GitHubNavigation } from "./useGitHubNavigation";
import { MenuItem, openMenu } from "./GitHubMenuList";

/**
 * Home's ⋯ button: sits at the right of the identity row, in line with the
 * avatar, and holds the shortcuts that have no counter above them. Anything
 * with a counter (repos, starred, gists, unread) stays a counter tap — no
 * duplicate entries here.
 */
export function HomeMenuButton({
  nav,
  login,
  onSignOut,
}: {
  nav: GitHubNavigation;
  login: string;
  onSignOut?: () => void;
}) {
  const { theme } = useTheme();

  const items: MenuItem[] = [
    { icon: "repo", label: "Repositories", hint: "All your repositories", onPress: () => nav.push({ name: "myRepos" }) },
    {
      icon: "person",
      label: "Followers",
      hint: "People following you",
      onPress: () => nav.push({ name: "followers", login }),
    },
    {
      icon: "people",
      label: "Following",
      hint: "People you follow",
      onPress: () => nav.push({ name: "following", login }),
    },
    {
      icon: "pulse",
      label: "Activity",
      hint: "Your public events",
      onPress: () => nav.push({ name: "activity", login }),
    },
    { icon: "plus", label: "New repository", hint: "Create a repository", onPress: () => nav.push({ name: "newRepo" }) },
    {
      icon: "issue-opened",
      label: "Issues assigned to me",
      hint: "Open issues with you as assignee",
      onPress: () => nav.push({ name: "search", query: "assignee:@me is:open", scope: "issues" }),
    },
    {
      icon: "git-pull-request",
      label: "Pull requests to review",
      hint: "Review requested from you",
      onPress: () => nav.push({ name: "search", query: "review-requested:@me is:open", scope: "issues" }),
    },
    { icon: "organization", label: "Organizations", hint: "Organizations you belong to", onPress: () => nav.push({ name: "orgs" }) },
    { icon: "code-square", label: "Search code", hint: "Search across repositories", onPress: () => nav.push({ name: "search", scope: "code" }) },
    { icon: "search", label: "Search users", hint: "Find people on GitHub", onPress: () => nav.push({ name: "search", scope: "users" }) },
    { icon: "pencil", label: "New gist", hint: "Share a snippet", onPress: () => nav.push({ name: "newGist" }) },
  ];
  if (onSignOut) items.push({ icon: "sign-out", label: "Sign out of GitHub", destructive: true, onPress: onSignOut });

  return (
    <TouchableOpacity
      style={[styles.btn, { backgroundColor: theme.bgTertiary, borderColor: theme.border }]}
      onPress={() => openMenu({ title: "GitHub shortcuts", items })}
      activeOpacity={0.7}
      accessibilityLabel="More actions"
    >
      <Octicons name="kebab-horizontal" size={14} color={theme.textSecondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 30,
    height: 26,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
});
