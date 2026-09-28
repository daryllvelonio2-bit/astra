import React, { useEffect, useState } from "react";
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
import { GitHubNavigation, ProfileTab } from "./useGitHubNavigation";
import { GitHubUserDetail, GitHubUserSummary } from "../../services/gitHubTypes";
import { formatJoined, formatStale } from "../../services/gitHubProfileService";
import { GitHubRepoListView } from "./GitHubRepoListView";
import { GitHubContribGraph } from "./GitHubContribGraph";

/**
 * The profile surface: identity, bio, counters, contribution graph, and the
 * four tabs (repositories / followers / following / activity).
 *
 * Shared by the profile route (any user) and Home (your own profile) so the
 * two cannot drift — that duplication is why the contribution graph had to be
 * transferred by hand. Home adds its own counters and shortcuts through props.
 *
 * Kept deliberately compact for a phone: company/location/blog/joined collapse
 * into ONE wrapped meta line instead of four stacked rows, the bio is clamped,
 * and rows/type are tightened. The header block is fixed; the tab body gets
 * `flex: 1` and owns the scrolling, so the lists stay virtualized and the
 * counters/tabs never scroll away.
 */

export type ProfileStat = {
  label: string;
  value: number;
  onPress: () => void;
  highlight?: boolean;
};

export function GitHubProfileBody({
  login,
  nav,
  onCloneRepo,
  reposMode = "owner",
  extraStats,
  showContribGraph = false,
  listClone = true,
  showList = true,
  initialTab = "repos",
  headerTrailing,
}: {
  login: string;
  nav: GitHubNavigation;
  onCloneRepo: (fullName: string) => void;
  /** "mine" adds the sort chips and clone shortcuts — your own profile. */
  reposMode?: "mine" | "owner";
  /** Counters appended to the profile's own (Home: Starred, Unread). */
  extraStats?: ProfileStat[];
  /** Contribution calendar. Home shows it; the profile route does not. */
  showContribGraph?: boolean;
  /**
   * Whether the repo list rows offer a Clone shortcut. Home turns it off: the
   * repo screen's ⋯ menu owns cloning.
   */
  listClone?: boolean;
  /**
   * Whether this surface shows its own list (with the tab bar). Home turns it
   * off: it is identity + counters + graph only, and every list is a pushed
   * screen, so its counters navigate instead of switching tabs.
   */
  showList?: boolean;
  /** Which tab to open on (a pushed Followers/Activity screen sets this). */
  initialTab?: ProfileTab;
  /**
   * Optional control rendered at the right of the identity row, in line with
   * the avatar — Home puts its ⋯ shortcuts menu there.
   */
  headerTrailing?: React.ReactNode;
}) {
  const { theme } = useTheme();
  const [tab, setTab] = useState<ProfileTab>(initialTab);

  // A pushed route can ask for a specific tab on an already-mounted body.
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const profile = useGitHubResource<GitHubUserDetail>(() => fetchUserProfile(login), [login]);

  if (profile.loading && !profile.data) return <LoadingState />;
  if (profile.error) return <ErrorState error={profile.error} onRetry={profile.refresh} />;
  if (!profile.data) return null;

  const u = profile.data;
  /** With no list of its own, each counter opens the matching screen. */
  const open = (target: ProfileTab, route: () => void) => () => (showList ? setTab(target) : route());
  const counters: ProfileStat[] = [
    { label: "Repos", value: u.publicRepos, onPress: open("repos", () => nav.push({ name: "myRepos" })) },
    {
      label: "Followers",
      value: u.followers,
      onPress: open("followers", () => nav.push({ name: "followers", login })),
    },
    {
      label: "Following",
      value: u.following,
      onPress: open("following", () => nav.push({ name: "following", login })),
    },
    { label: "Gists", value: u.publicGists, onPress: () => nav.push({ name: "gists" }) },
    ...(extraStats || []),
  ];

  const head = (
    <View style={[styles.head, { borderBottomColor: theme.border }]}>
        <View style={styles.headTop}>
          {u.avatarUrl ? (
            <Image source={{ uri: u.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: `${theme.accent}22` }]}>
              <Octicons name="person" size={18} color={theme.accent} />
            </View>
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
            <View style={styles.metaRow}>
              {!!u.company && <Text style={[styles.meta, { color: theme.textMuted }]}>{u.company}</Text>}
              {!!u.location && <Text style={[styles.meta, { color: theme.textMuted }]}>{u.location}</Text>}
              {!!u.blog && (
                <Text style={[styles.meta, { color: theme.accent }]} numberOfLines={1}>
                  {u.blog}
                </Text>
              )}
              <Text style={[styles.meta, { color: theme.textMuted }]}>{formatJoined(u.createdAt)}</Text>
            </View>
          </View>
          {!!headerTrailing && <View style={styles.headTrailing}>{headerTrailing}</View>}
        </View>

        {!!u.bio && (
          <Text style={[styles.bio, { color: theme.textSecondary }]} numberOfLines={3}>
            {u.bio}
          </Text>
        )}

        <View style={[styles.stats, { borderTopColor: theme.border }]}>
          {counters.map((c) => (
            <Counter key={c.label} {...c} />
          ))}
        </View>

        {!u.isOrganization && showContribGraph && <GitHubContribGraph login={u.login} />}
    </View>
  );

  // No list of its own (Home): the header is the whole surface and scrolls.
  if (!showList) {
    return (
      <ScrollView showsVerticalScrollIndicator={false} style={styles.wrap}>
        {head}
      </ScrollView>
    );
  }

  return (
    <View style={styles.wrap}>
      {head}

      <View style={[styles.tabs, { borderBottomColor: theme.border }]}>
        <TabBtn label="Repositories" active={tab === "repos"} onPress={() => setTab("repos")} />
        <TabBtn label="Followers" active={tab === "followers"} onPress={() => setTab("followers")} />
        <TabBtn label="Following" active={tab === "following"} onPress={() => setTab("following")} />
        <TabBtn label="Activity" active={tab === "activity"} onPress={() => setTab("activity")} />
      </View>

      <View style={styles.body}>
        {tab === "repos" && (
          <GitHubRepoListView
            nav={nav}
            mode={reposMode}
            owner={reposMode === "owner" ? login : undefined}
            onCloneRepo={listClone ? onCloneRepo : undefined}
          />
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
      <View style={{ height: 12 }} />
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

function Counter({ label, value, onPress, highlight }: ProfileStat) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity style={styles.counter} onPress={onPress} activeOpacity={0.7}>
      <Text style={[styles.counterValue, { color: highlight ? theme.accentGold : theme.textPrimary }]}>
        {value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}
      </Text>
      <Text style={[styles.counterLabel, { color: theme.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
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
      <Text style={[styles.tabText, { color: active ? theme.textPrimary : theme.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  head: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  headTop: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  headTrailing: { marginTop: 2 },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  headText: { flex: 1, gap: 1, minWidth: 0 },
  name: { fontSize: 14.5, fontWeight: "800" },
  handle: { fontSize: 11.5 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 2 },
  meta: { fontSize: 10.5 },
  bio: { fontSize: 11.5, lineHeight: 16 },
  stats: { flexDirection: "row", paddingVertical: 7, borderTopWidth: StyleSheet.hairlineWidth },
  counter: { flex: 1, alignItems: "center", gap: 1 },
  counterValue: { fontSize: 13.5, fontWeight: "800" },
  counterLabel: { fontSize: 9.5 },
  tabs: { flexDirection: "row", paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 6, paddingHorizontal: 4, borderBottomWidth: 2 },
  tabText: { fontSize: 11, fontWeight: "700" },
  body: { flex: 1 },
  eventRow: {
    flexDirection: "row",
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  eventBody: { flex: 1, gap: 1 },
  eventText: { fontSize: 11.5, lineHeight: 16 },
  eventRepo: { fontSize: 10.5 },
});