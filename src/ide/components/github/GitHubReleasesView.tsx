import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Octicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useTheme } from "../../../theme/themeContext";
import { fetchReleases, fetchReleaseByTag } from "../../services/gitHubRepoService";
import { useGitHubResource } from "./useGitHubResource";
import { EmptyState, ErrorState, LoadingState } from "./GitHubStates";
import { GitHubNavigation } from "./useGitHubNavigation";
import { formatStale } from "../../services/gitHubProfileService";

/**
 * Releases: the list (latest tagged first) and a detail view showing the
 * body. Download/open links go to the browser, same as github.com.
 */

export function GitHubReleasesView({
  owner,
  repo,
  nav,
}: {
  owner: string;
  repo: string;
  nav: GitHubNavigation;
}) {
  const { theme } = useTheme();
  const releases = useGitHubResource(() => fetchReleases(owner, repo, 40), [owner, repo]);

  if (releases.loading && !releases.data) return <LoadingState />;
  if (releases.error) return <ErrorState error={releases.error} onRetry={releases.refresh} />;
  if ((releases.data || []).length === 0) {
    return <EmptyState text="No releases yet." hint="Create one from the release form on the repo screen." />;
  }

  const first = releases.data![0];
  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {(releases.data || []).map((release, index) => (
        <TouchableOpacity
          key={release.id}
          style={[styles.row, { borderBottomColor: theme.border }]}
          onPress={() => nav.push({ name: "release", owner, repo, tag: release.tagName })}
          activeOpacity={0.7}
        >
          <Octicons name="tag" size={13} color={index === 0 ? theme.accent : theme.textMuted} />
          <View style={styles.body}>
            <View style={styles.titleRow}>
              <Text style={[styles.tagName, { color: theme.textPrimary }]}>
                {release.tagName}
              </Text>
              {index === 0 && !release.isDraft && !release.isPrerelease && (
                <Text style={[styles.badge, { color: theme.accent }]}>Latest</Text>
              )}
              {release.isPrerelease && <Text style={[styles.badge, { color: theme.accentGold }]}>Pre-release</Text>}
              {release.isDraft && <Text style={[styles.badge, { color: theme.textMuted }]}>Draft</Text>}
            </View>
            {!!release.name && release.name !== release.tagName && (
              <Text style={[styles.name, { color: theme.textSecondary }]} numberOfLines={1}>
                {release.name}
              </Text>
            )}
            <Text style={[styles.meta, { color: theme.textMuted }]}>
              {release.authorLogin || "unknown"} · {formatStale(release.publishedAt || release.createdAt)}
            </Text>
          </View>
          <Octicons name="chevron-right" size={12} color={theme.textMuted} />
        </TouchableOpacity>
      ))}
      <View style={{ height: 12 }} />
      {first.htmlUrl && (
        <TouchableOpacity
          style={[styles.footer, { borderTopColor: theme.border }]}
          onPress={() => WebBrowser.openBrowserAsync(`${first.htmlUrl.replace(/\/tag\/.*$/, "")}`).catch(() => {})}
        >
          <Text style={[styles.footerText, { color: theme.accent }]}>View all releases on GitHub</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

export function GitHubReleaseDetailView({ owner, repo, tag }: { owner: string; repo: string; tag: string }) {
  const { theme } = useTheme();
  const release = useGitHubResource(() => fetchReleaseByTag(owner, repo, tag), [owner, repo, tag]);

  if (release.loading && !release.data) return <LoadingState />;
  if (release.error) return <ErrorState error={release.error} onRetry={release.refresh} />;
  if (!release.data) return null;

  const r = release.data;
  return (
    <ScrollView showsVerticalScrollIndicator={false} style={styles.detail}>
      <View style={styles.titleRow}>
        <Text style={[styles.tagName, { color: theme.textPrimary }]}>{r.tagName}</Text>
        {r.isPrerelease && <Text style={[styles.badge, { color: theme.accentGold }]}>Pre-release</Text>}
      </View>
      {!!r.name && r.name !== r.tagName && (
        <Text style={[styles.name, { color: theme.textSecondary }]}>{r.name}</Text>
      )}
      <Text style={[styles.meta, { color: theme.textMuted }]}>
        {r.authorLogin} published {formatStale(r.publishedAt || r.createdAt)}
      </Text>
      {!!r.body && <Text style={[styles.bodyText, { color: theme.textSecondary }]}>{r.body}</Text>}
      {!!r.htmlUrl && (
        <TouchableOpacity
          style={[styles.linkBtn, { backgroundColor: `${theme.accent}18`, borderColor: `${theme.accent}44` }]}
          onPress={() => WebBrowser.openBrowserAsync(r.htmlUrl).catch(() => {})}
        >
          <Octicons name="download" size={12} color={theme.accent} />
          <Text style={[styles.linkText, { color: theme.accent }]}>Assets & downloads on GitHub</Text>
        </TouchableOpacity>
      )}
      <View style={{ height: 16 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  body: { flex: 1, gap: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  tagName: { fontSize: 13, fontWeight: "800" },
  badge: { fontSize: 9.5, fontWeight: "800" },
  name: { fontSize: 11.5 },
  meta: { fontSize: 10.5 },
  footer: { paddingVertical: 10, alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth },
  footerText: { fontSize: 11.5, fontWeight: "700" },
  detail: { paddingHorizontal: 14, paddingTop: 12, gap: 6 },
  bodyText: { fontSize: 12.5, lineHeight: 19, marginTop: 8 },
  linkBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 36, borderRadius: 8, borderWidth: 1, marginTop: 14 },
  linkText: { fontSize: 12, fontWeight: "700" },
});