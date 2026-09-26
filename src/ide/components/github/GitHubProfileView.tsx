import React from "react";
import { View, Text, Image, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import {
  fetchUserProfile,
  fetchFollowers,
  fetchFollowing,
  fetchUserEvents,
} from "../../services/gitHubAccountService";
import { useGitHubResource } from "./useGitHubResource";
import { EmptyState, ErrorState, LoadingState } from "./GitHubStates";
import { UserRow } from "./GitHubRow";
import { GitHubNavigation } from "./useGitHubNavigation";
import { GitHubUserDetail, GitHubUserSummary } from "../../services/gitHubTypes";
import { formatJoined, formatStale } from "../../services/gitHubProfileService";
import { GitHubRepoListView } from "./GitHubRepoListView";
import { GitHubContribGraph } from "./GitHubContribGraph";

/**
 * Profile of any user or organization: identity, stats, bio, and tabs for
 * their repositories, followers, following and public activity. Works for
 * people you do not follow — this is the "not just mine" path.
 */

type ProfileTab = "repos" | "followers" | "following" | "activity";

export function GitHubProfileView({
  login,
  nav,
  onCloneRepo,
}: {
  login: string;
  nav: GitHubNavigation;
  onCloneRepo: (fullName: string) => void;
}) {
  const { theme } = useTheme();
  const [tab, setTab] = React.useState<ProfileTab>("repos");

  const profile = useGitHubResource<GitHubUserDetail>(() => fetchUserProfile(login), [login]);

  if (profile.loading && !profile.data) return <LoadingState />;
  if (profile.error) return <ErrorState error={profile.error} onRetry={profile.refresh} />;
  if (!profile.data) return null;

  const u = profile.data;

  return (
    <View style={styles.wrap}>
      <View style={[styles.head, { borderBottomColor: theme.border }]}>
        <View style={styles.headTop}>
          {u.avatarUrl ? (
            <Image source={{ uri: u.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: theme.accent }]} />
          )}
          <View style={styles.headText}>
            {!!u.name && (
              <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
                {u.name}
              </Text>
            )}
            <Text style={[styles.handle, { color: theme.textSecondary }]} numberOfLines={1}>
              @{u.login}
              {u.isOrganization ? " · organization" : ""}
            </Text>
            {!!u.company && <Text style={[styles.detail, { color: theme.textMuted }]}>{u.company}</Text>}
            {!!u.location && <Text style={[styles.detail, { color: theme.textMuted }]}>{u.location}</Text>}
            {!!u.blog && <Text style={[styles.detail, { color: theme.accent }]} numberOfLines={1}>{u.blog}</Text>}
            <Text style={[styles.detail, { color: theme.textMuted }]}>{formatJoined(u.createdAt)}</Text>
          </View>
        </View>

        {!!u.bio && <Text style={[styles.bio, { color: theme.textSecondary }]}>{u.bio}</Text>}

        <View style={[styles.stats, { borderTopColor: theme.border, borderBottomColor: theme.border }]}>
          <Stat label="Repos" value={u.publicRepos} onPress={() => setTab("repos")} />
          <Stat label="Followers" value={u.followers} onPress={() => setTab("followers")} />
          <Stat label="Following" value={u.following} onPress={() => setTab("following")} />
          <Stat label="Gists" value={u.publicGists} onPress={() => nav.push({ name: "gists" })} />
        </View>

        {!u.isOrganization && <GitHubContribGraph login={u.login} />}
      </View>

      <View style={[styles.tabs, { borderBottomColor: theme.border }]}>
        <TabBtn label="Repositories" active={tab === "repos"} onPress={() => setTab("repos")} />
        <TabBtn label="Followers" active={tab === "followers"} onPress={() => setTab("followers")} />
        <TabBtn label="Following" active={tab === "following"} onPress={() => setTab("following")} />
        <TabBtn label="Activity" active={tab === "activity"} onPress={() => setTab("activity")} />
      </View>

      <View style={styles.body}>
        {tab === "repos" && (
          <GitHubRepoListView nav={nav} mode="owner" owner={login} onCloneRepo={onCloneRepo} />
        )}
        {tab === "followers" && <PeopleList login={login} kind="followers" nav={nav} />}
        {tab === "following" && <PeopleList login={login} kind="following" nav={nav} />}
        {tab === "activity" && <ActivityList login={login} nav={nav} />}
      </View>
    </View>
  );
}

function PeopleList({
  login,
  kind,
  nav,
}: {
  login: string;
  kind: "followers" | "following";
  nav: GitHubNavigation;
}) {
  const list = useGitHubResource<GitHubUserSummary[]>(
    () => (kind === "followers" ? fetchFollowers(login, 60) : fetchFollowing(login, 60)),
    [login, kind]
  );

  if (list.loading && !list.data) return <LoadingState />;
  if (list.error) return <ErrorState error={list.error} onRetry={list.refresh} />;
  if ((list.data || []).length === 0) {
    return <EmptyState text={kind === "followers" ? "No followers yet." : "Not following anyone yet."} />;
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {(list.data || []).map((user) => (
        <UserRow key={user.login} user={user} onPress={() => nav.push({ name: "profile", login: user.login })} />
      ))}
    </ScrollView>
  );
}

function ActivityList({ login, nav }: { login: string; nav: GitHubNavigation }) {
  const { theme } = useTheme();
  const events = useGitHubResource(() => fetchUserEvents(login, 40), [login]);

  if (events.loading && !events.data) return <LoadingState />;
  if (events.error) return <ErrorState error={events.error} onRetry={events.refresh} />;
  if ((events.data || []).length === 0) return <EmptyState text="No public activity." />;

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {(events.data || []).map((event) => {
        const [owner, repo] = event.repoFullName.split("/");
        return (
          <View key={event.id} style={[styles.eventRow, { borderBottomColor: theme.border }]}>
            <Octicons name="git-commit" size={12} color={theme.textMuted} />
            <View style={styles.eventBody}>
              <Text style={[styles.eventText, { color: theme.textSecondary }]} numberOfLines={2}>
                <Text style={{ fontWeight: "700", color: theme.textPrimary }}>{event.actorLogin} </Text>
                {event.summary}
              </Text>
              <Text
                style={[styles.eventRepo, { color: theme.accent }]}
                numberOfLines={1}
                onPress={() => owner && repo && nav.push({ name: "repo", owner, repo })}
              >
                {event.repoFullName} · {formatStale(event.createdAt)}
              </Text>
            </View>
          </View>
        );
      })}
      <View style={{ height: 12 }} />
    </ScrollView>
  );
}

function Stat({ label, value, onPress }: { label: string; value: number; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity style={styles.stat} onPress={onPress} activeOpacity={0.7}>
      <Text style={[styles.statValue, { color: theme.textPrimary }]}>
        {value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}
      </Text>
      <Text style={[styles.statLabel, { color: theme.textMuted }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function TabBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.tabBtn, { borderBottomColor: active ? theme.accent : "transparent" }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.tabText, { color: active ? theme.textPrimary : theme.textSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  head: { paddingHorizontal: 12, paddingTop: 10, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  headTop: { flexDirection: "row", gap: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#333" },
  headText: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: "800" },
  handle: { fontSize: 12.5 },
  detail: { fontSize: 11 },
  bio: { fontSize: 12, lineHeight: 17 },
  stats: { flexDirection: "row", paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  stat: { flex: 1, alignItems: "center", gap: 1 },
  statValue: { fontSize: 14, fontWeight: "800" },
  statLabel: { fontSize: 10 },
  tabs: { flexDirection: "row", paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn: { paddingVertical: 8, paddingHorizontal: 9, borderBottomWidth: 2 },
  tabText: { fontSize: 11.5, fontWeight: "700" },
  body: { flex: 1 },
  eventRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  eventBody: { flex: 1, gap: 2 },
  eventText: { fontSize: 11.5, lineHeight: 16 },
  eventRepo: { fontSize: 10.5 },
});