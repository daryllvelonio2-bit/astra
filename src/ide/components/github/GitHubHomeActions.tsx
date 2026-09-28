import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { GitHubNavigation } from "./useGitHubNavigation";

interface ActionItem {
  icon: string;
  iconColor?: string;
  label: string;
  hint: string;
  destructive?: boolean;
  onPress: () => void;
}

interface ActionSection {
  title: string;
  items: ActionItem[];
}

export function GitHubHomeActions({
  nav,
  login,
  onSignOut,
}: {
  nav: GitHubNavigation;
  login: string;
  onSignOut?: () => void;
}) {
  const { theme } = useTheme();

  const sections: ActionSection[] = [
    {
      title: "My Work",
      items: [
        {
          icon: "issue-opened",
          iconColor: theme.accentGreen,
          label: "Issues assigned to me",
          hint: "Open issues with you as assignee",
          onPress: () => nav.push({ name: "search", query: "assignee:@me is:open", scope: "issues" }),
        },
        {
          icon: "git-pull-request",
          iconColor: theme.accentPurple,
          label: "Pull requests to review",
          hint: "Review requested from you",
          onPress: () => nav.push({ name: "search", query: "review-requested:@me is:open", scope: "issues" }),
        },
        {
          icon: "repo",
          iconColor: theme.accent,
          label: "Repositories",
          hint: "All your repositories",
          onPress: () => nav.push({ name: "myRepos" }),
        },
        {
          icon: "organization",
          iconColor: theme.accentGold,
          label: "Organizations",
          hint: "Organizations you belong to",
          onPress: () => nav.push({ name: "orgs" }),
        },
      ],
    },
    {
      title: "Quick Actions",
      items: [
        {
          icon: "plus",
          iconColor: theme.accentGreen,
          label: "New repository",
          hint: "Create a repository",
          onPress: () => nav.push({ name: "newRepo" }),
        },
        {
          icon: "pencil",
          iconColor: theme.accentCyan,
          label: "New gist",
          hint: "Share a snippet",
          onPress: () => nav.push({ name: "newGist" }),
        },
      ],
    },
    {
      title: "Community & Activity",
      items: [
        {
          icon: "pulse",
          iconColor: theme.accentGold,
          label: "Activity",
          hint: "Your public events",
          onPress: () => nav.push({ name: "activity", login }),
        },
        {
          icon: "person",
          iconColor: theme.accent,
          label: "Followers",
          hint: "People following you",
          onPress: () => nav.push({ name: "followers", login }),
        },
        {
          icon: "people",
          iconColor: theme.accentPurple,
          label: "Following",
          hint: "People you follow",
          onPress: () => nav.push({ name: "following", login }),
        },
      ],
    },
    {
      title: "Explore",
      items: [
        {
          icon: "code-square",
          iconColor: theme.accentCyan,
          label: "Search code",
          hint: "Search across repositories",
          onPress: () => nav.push({ name: "search", scope: "code" }),
        },
        {
          icon: "search",
          iconColor: theme.accent,
          label: "Search users",
          hint: "Find people on GitHub",
          onPress: () => nav.push({ name: "search", scope: "users" }),
        },
      ],
    },
  ];

  if (onSignOut) {
    sections.push({
      title: "Account",
      items: [
        {
          icon: "sign-out",
          label: "Sign out of GitHub",
          hint: "Disconnect account from this device",
          destructive: true,
          onPress: onSignOut,
        },
      ],
    });
  }

  return (
    <View style={styles.container}>
      {sections.map((sec) => (
        <View key={sec.title} style={styles.section}>
          <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>{sec.title}</Text>
          <View style={[styles.card, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
            {sec.items.map((item, idx) => (
              <TouchableOpacity
                key={item.label}
                style={[
                  styles.row,
                  idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                ]}
                activeOpacity={0.7}
                onPress={item.onPress}
                accessibilityLabel={item.label}
              >
                <View
                  style={[
                    styles.iconWrap,
                    { backgroundColor: item.destructive ? `${theme.accentRed}18` : theme.bgTertiary },
                  ]}
                >
                  <Octicons
                    name={item.icon as any}
                    size={14}
                    color={item.destructive ? theme.accentRed : item.iconColor || theme.textSecondary}
                  />
                </View>
                <View style={styles.rowText}>
                  <Text
                    style={[
                      styles.rowLabel,
                      { color: item.destructive ? theme.accentRed : theme.textPrimary },
                    ]}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                  {!!item.hint && (
                    <Text style={[styles.rowHint, { color: theme.textMuted }]} numberOfLines={1}>
                      {item.hint}
                    </Text>
                  )}
                </View>
                <Octicons name="chevron-right" size={13} color={theme.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 10,
    paddingBottom: 24,
  },
  section: {
    marginBottom: 14,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginHorizontal: 16,
    marginBottom: 6,
  },
  card: {
    marginHorizontal: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  rowHint: {
    fontSize: 10.5,
  },
});
