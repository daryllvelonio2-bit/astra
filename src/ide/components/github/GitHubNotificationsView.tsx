import React, { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Octicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useTheme } from "../../../theme/themeContext";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../services/gitHubAccountService";
import { useGitHubResource, useGitHubAction } from "./useGitHubResource";
import { EmptyState, ErrorState, LoadingState } from "./GitHubStates";
import { FilterStrip } from "./GitHubControls";
import { GitHubNavigation } from "./useGitHubNavigation";
import { GitHubNotification } from "../../services/gitHubTypes";
import { formatStale } from "../../services/gitHubProfileService";

/**
 * Notifications inbox: unread/all filter, per-thread mark-as-read on tap,
 * and "mark all read". Tapping opens the thread in the app when it can
 * (issue/PR numbers are parsed out), otherwise falls back to the browser.
 */

type InboxFilter = "unread" | "all";

export function GitHubNotificationsView({ nav, login }: { nav: GitHubNavigation; login?: string }) {
  const { theme } = useTheme();
  const [filter, setFilter] = useState<InboxFilter>("unread");

  const list = useGitHubResource(
    () => fetchNotifications({ all: filter === "all", limit: 80 }),
    [filter]
  );
  const action = useGitHubAction();

  const open = useCallback(
    (item: GitHubNotification) => {
      if (item.unread) void action.run(() => markNotificationRead(item.id), list.refresh);
      const match = item.webUrl.match(/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)/);
      if (match) {
        nav.push({
          name: "issue",
          owner: match[1],
          repo: match[2],
          number: parseInt(match[4], 10),
          isPull: match[3] === "pull",
        });
        return;
      }
      if (item.repoFullName) {
        const [owner, repo] = item.repoFullName.split("/");
        if (owner && repo) {
          nav.push({ name: "repo", owner, repo });
          return;
        }
      }
      if (item.webUrl) WebBrowser.openBrowserAsync(item.webUrl).catch(() => {});
    },
    [action, list, nav]
  );

  if (!login) return <EmptyState text="Sign in to see notifications." />;
  if (list.loading && !list.data) return <LoadingState />;
  if (list.error) return <ErrorState error={list.error} onRetry={list.refresh} />;

  const items = list.data || [];

  return (
    <View style={styles.wrap}>
      <FilterStrip<InboxFilter>
        options={[
          { key: "unread", label: "Unread", count: items.filter((n) => n.unread).length },
          { key: "all", label: "All" },
        ]}
        value={filter}
        onChange={setFilter}
      />
      <View style={[styles.barRow, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          onPress={() => action.run(() => markAllNotificationsRead(), list.refresh)}
          activeOpacity={0.7}
        >
          <Text style={[styles.markAll, { color: theme.accent }]}>Mark all as read</Text>
        </TouchableOpacity>
      </View>

      {items.length === 0 ? (
        <EmptyState text={filter === "unread" ? "Inbox zero." : "No notifications."} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {items.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.row, { borderBottomColor: theme.border }]}
              onPress={() => open(item)}
              activeOpacity={0.7}
            >
              <Octicons
                name={item.unread ? "dot-fill" : "circle"}
                size={item.unread ? 10 : 11}
                color={item.unread ? theme.accent : theme.borderLight}
                style={styles.dot}
              />
              <View style={styles.body}>
                <Text style={[styles.title, { color: item.unread ? theme.textPrimary : theme.textSecondary }]} numberOfLines={2}>
                  {item.subjectTitle}
                </Text>
                <Text style={[styles.meta, { color: theme.textMuted }]} numberOfLines={1}>
                  {item.repoFullName} · {reasonLabel(item.reason)} · {formatStale(item.updatedAt)}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
          <View style={{ height: 12 }} />
        </ScrollView>
      )}
    </View>
  );
}

function reasonLabel(reason: string): string {
  switch (reason) {
    case "assign":
      return "assigned";
    case "author":
      return "your post";
    case "comment":
      return "commented";
    case "invitation":
      return "invited";
    case "manual":
      return "subscribed";
    case "mention":
      return "mentioned you";
    case "review_requested":
      return "review requested";
    case "security_alert":
      return "security alert";
    case "state_change":
      return "state changed";
    case "subscribed":
      return "subscribed";
    case "team_mention":
      return "team mentioned";
    default:
      return reason || "activity";
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  barRow: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  markAll: { fontSize: 11.5, fontWeight: "700" },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dot: { marginTop: 4 },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 12.5, fontWeight: "600", lineHeight: 17 },
  meta: { fontSize: 10.5 },
});
