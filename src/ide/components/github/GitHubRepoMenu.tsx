import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { dismissAppDialog, showAppDialog } from "../../services/appDialog";
import { GitHubNavigation } from "./useGitHubNavigation";

/**
 * Repo header overflow. Commits / Releases / Contributors / Settings used to
 * be four buttons crowding the header into a horizontal scroll strip; they
 * now live behind one ⋯ tap. Rendered inside the shared themed dialog, so
 * there is no second modal implementation to keep in sync.
 */

export function openRepoMenu({
  nav,
  owner,
  repo,
  refName,
  onClone,
}: {
  nav: GitHubNavigation;
  owner: string;
  repo: string;
  refName: string;
  onClone: () => void;
}): void {
  showAppDialog({
    title: `${owner}/${repo}`,
    content: (
      <RepoMenuList nav={nav} owner={owner} repo={repo} refName={refName} onClone={onClone} />
    ),
    buttons: [{ text: "Close", style: "cancel" }],
  });
}

function RepoMenuList({
  nav,
  owner,
  repo,
  refName,
  onClone,
}: {
  nav: GitHubNavigation;
  owner: string;
  repo: string;
  refName: string;
  onClone: () => void;
}) {
  const { theme } = useTheme();

  const items: Array<{ icon: string; label: string; hint: string; onPress: () => void }> = [
    {
      icon: "download",
      label: "Clone",
      hint: "Copy this repository into the current workspace",
      onPress: onClone,
    },
    {
      icon: "history",
      label: "Commits",
      hint: `History on ${refName}`,
      onPress: () => nav.push({ name: "commits", owner, repo, ref: refName }),
    },
    {
      icon: "tag",
      label: "Releases",
      hint: "Tags and published releases",
      onPress: () => nav.push({ name: "releases", owner, repo }),
    },
    {
      icon: "people",
      label: "Contributors",
      hint: "Who has committed here",
      onPress: () => nav.push({ name: "contributors", owner, repo }),
    },
    {
      icon: "gear",
      label: "Settings",
      hint: "Edit repository metadata",
      onPress: () => nav.push({ name: "repoSettings", owner, repo }),
    },
  ];

  return (
    <View style={styles.list}>
      {items.map((item, index) => (
        <TouchableOpacity
          key={item.label}
          style={[
            styles.row,
            index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth },
          ]}
          activeOpacity={0.7}
          onPress={() => {
            dismissAppDialog();
            item.onPress();
          }}
        >
          <Octicons name={item.icon as any} size={14} color={theme.textSecondary} />
          <View style={styles.rowText}>
            <Text style={[styles.label, { color: theme.textPrimary }]}>{item.label}</Text>
            <Text style={[styles.hint, { color: theme.textMuted }]} numberOfLines={1}>
              {item.hint}
            </Text>
          </View>
          <Octicons name="chevron-right" size={12} color={theme.textMuted} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  rowText: { flex: 1, gap: 1, minWidth: 0 },
  label: { fontSize: 13.5, fontWeight: "700" },
  hint: { fontSize: 10.5 },
});
