import React, { useState } from "react";
import { View, Text, Image, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Octicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useTheme } from "../../../theme/themeContext";
import { fetchGists } from "../../services/gitHubAccountService";
import { fetchContributors } from "../../services/gitHubRepoService";
import { useGitHubResource } from "./useGitHubResource";
import { EmptyState, ErrorState, LoadingState } from "./GitHubStates";
import { UserRow } from "./GitHubRow";
import { GitHubNavigation } from "./useGitHubNavigation";
import { formatStale } from "../../services/gitHubProfileService";

/**
 * Gists and contributors — the two remaining public GitHub surfaces worth
 * showing here. Gists open in the browser (the gist API does not expose
 * raw content without extra round-trips); contributors drill into profiles.
 */

export function GitHubGistsView({ nav }: { nav: GitHubNavigation }) {
  const { theme } = useTheme();
  const gists = useGitHubResource(() => fetchGists(undefined, 40), []);

  if (gists.loading && !gists.data) return <LoadingState />;
  if (gists.error) return <ErrorState error={gists.error} onRetry={gists.refresh} />;
  if ((gists.data || []).length === 0) {
    return <EmptyState text="No gists yet." hint="Gists created on github.com appear here." />;
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {(gists.data || []).map((gist) => (
        <TouchableOpacity
          key={String(gist.id)}
          style={[styles.row, { borderBottomColor: theme.border }]}
          onPress={() => WebBrowser.openBrowserAsync(gist.htmlUrl).catch(() => {})}
          activeOpacity={0.7}
        >
          <Octicons name="code" size={13} color={gist.isPublic ? theme.accent : theme.textMuted} />
          <View style={styles.body}>
            <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>
              {gist.description || gist.files[0]?.name || "Untitled gist"}
            </Text>
            <View style={styles.meta}>
              <Text style={[styles.metaText, { color: theme.textMuted }]}>
                {gist.files.map((f) => f.name).slice(0, 3).join(", ")}
              </Text>
              <Text style={[styles.metaText, { color: theme.textMuted }]}>
                {gist.isPublic ? "public" : "secret"} · {formatStale(gist.updatedAt)}
              </Text>
              {gist.commentCount > 0 && (
                <Text style={[styles.metaText, { color: theme.textMuted }]}>💬 {gist.commentCount}</Text>
              )}
            </View>
          </View>
        </TouchableOpacity>
      ))}
      <View style={{ height: 12 }} />
    </ScrollView>
  );
}

export function GitHubContributorsView({
  owner,
  repo,
  nav,
}: {
  owner: string;
  repo: string;
  nav: GitHubNavigation;
}) {
  const contributors = useGitHubResource(() => fetchContributors(owner, repo, 50), [owner, repo]);

  if (contributors.loading && !contributors.data) return <LoadingState />;
  if (contributors.error) return <ErrorState error={contributors.error} onRetry={contributors.refresh} />;
  if ((contributors.data || []).length === 0) return <EmptyState text="No contributors found." />;

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {(contributors.data || []).map((person) => (
        <UserRow
          key={person.login}
          user={person}
          onPress={() => nav.push({ name: "profile", login: person.login })}
        />
      ))}
      <View style={{ height: 12 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 12.5, fontWeight: "700" },
  meta: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  metaText: { fontSize: 10.5 },
});