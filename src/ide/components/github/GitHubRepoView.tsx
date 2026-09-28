import React, { useEffect, useState } from "react";
import { Animated, View, Text, Image, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { fetchRepo, fetchLanguages } from "../../services/gitHubRepoService";
import { starRepo, unstarRepo, forkRepo, watchRepo, isFollowing, followUser, unfollowUser } from "../../services/gitHubAccountService";
import { useGitHubResource, useGitHubAction } from "./useGitHubResource";
import { ErrorState, LoadingState } from "./GitHubStates";
import { GitHubRepoCodeView } from "./GitHubRepoCodeView";
import { GitHubIssueListView } from "./GitHubIssueListView";
import { GitHubActionsView } from "./GitHubActionsView";
import { GitHubNavigation } from "./useGitHubNavigation";
import { formatStale } from "../../services/gitHubProfileService";
import { openRepoMenu } from "./GitHubRepoMenu";
import { useRepoHeaderCollapse } from "./useRepoHeaderCollapse";

/**
 * The repository screen: identity header (star / watch / fork / follow),
 * language bar, about line, and the four tabs the web UI has — Code,
 * Issues, Pull requests, Actions. Owns the ref (branch) the code tab reads.
 */

type RepoTabKey = "code" | "issues" | "pulls" | "actions";

export function GitHubRepoView({
  owner,
  repo,
  nav,
  login,
  onCloneRepo,
  onOpenBranches,
}: {
  owner: string;
  repo: string;
  nav: GitHubNavigation;
  login?: string;
  onCloneRepo: (fullName: string) => void;
  onOpenBranches: () => void;
}) {
  const { theme } = useTheme();
  const [tab, setTab] = useState<RepoTabKey>("code");
  const [path, setPath] = useState("");
  const [ref, setRef] = useState<string | undefined>(undefined);

  const detail = useGitHubResource(() => fetchRepo(owner, repo), [owner, repo]);
  const languages = useGitHubResource(() => fetchLanguages(owner, repo), [owner, repo]);
  const following = useGitHubResource(
    () => isFollowing(owner).then((ok) => ({ ok: true as const, data: ok })),
    [owner],
    { skip: !login || owner === login }
  );
  const action = useGitHubAction();

  // While the README takes over the screen, the header slides up out of the
  // way and the README gets the whole viewport.
  const collapse = useRepoHeaderCollapse();
  const { reset: resetCollapse } = collapse;

  // A different tab or folder means a different top block and a different
  // scroll offset: always restart from a whole header.
  useEffect(() => {
    resetCollapse();
  }, [tab, path, resetCollapse]);

  const refName = ref || detail.data?.defaultBranch || "main";
  const languageTotal = (languages.data || []).reduce((sum, l) => sum + l.bytes, 0);

  if (detail.loading && !detail.data) return <LoadingState />;
  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.refresh} />;
  if (!detail.data) return null;

  const r = detail.data;

  return (
    <View style={styles.wrap}>
      {/* One floating block over a full-height body. Lifting the body by the
          same amount (the previous design) kept its box size stable but
          vacated a band at the bottom of the screen that painted over the
          README. Floating instead: the body never moves, so it simply gains
          the pixels the header releases. */}
      <Animated.View
        style={[styles.topBlock, { backgroundColor: theme.bgPrimary }, collapse.liftStyle]}
        onLayout={collapse.onTopLayout}
      >
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <View style={styles.headerTop}>
          {r.ownerAvatar ? (
            <Image source={{ uri: r.ownerAvatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: theme.accent }]} />
          )}
          <View style={styles.headerText}>
            <Text style={[styles.fullName, { color: theme.textPrimary }]} numberOfLines={1}>
              {r.fullName}
            </Text>
            <View style={styles.metaRow}>
              <Octicons
                name={r.isPrivate ? "lock" : r.isFork ? "repo-forked" : "repo"}
                size={9}
                color={theme.textMuted}
              />
              <Text style={[styles.metaText, { color: theme.textMuted }]}>{r.visibility}</Text>
              {!!r.license && <Text style={[styles.metaText, { color: theme.textMuted }]}>{r.license}</Text>}
              {!!r.updatedAt && (
                <Text style={[styles.metaText, { color: theme.textMuted }]}>
                  updated {formatStale(r.updatedAt)}
                </Text>
              )}
              {!!r.pushedAt && r.pushedAt !== r.updatedAt && (
                <Text style={[styles.metaText, { color: theme.textMuted }]}>
                  pushed {formatStale(r.pushedAt)}
                </Text>
              )}
              {!!r.homepage && (
                <Text style={[styles.metaText, { color: theme.accent }]} numberOfLines={1}>
                  {r.homepage}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.statRow}>
            <StatBtn
              icon="star"
              value={r.stars}
              onPress={() => action.run(() => starRepo(owner, repo), detail.refresh)}
            />
            <StatBtn
              icon="repo-forked"
              value={r.forks}
              onPress={() => action.run(() => forkRepo(owner, repo), detail.refresh)}
            />
            <StatBtn icon="eye" onPress={() => action.run(() => watchRepo(owner, repo))} />
            <StatBtn
              icon="kebab-horizontal"
              onPress={() =>
                openRepoMenu({
                  nav,
                  owner,
                  repo,
                  refName,
                  onClone: () => onCloneRepo(r.fullName),
                })
              }
            />
          </View>
        </View>

        {!!r.description && (
          <Text style={[styles.description, { color: theme.textSecondary }]} numberOfLines={2}>
            {r.description}
          </Text>
        )}

        {r.topics && r.topics.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.topicScroll}>
            <View style={styles.topicRow}>
              {r.topics.map((topic) => (
                <Text
                  key={topic}
                  style={[
                    styles.topic,
                    {
                      color: theme.accent,
                      backgroundColor: `${theme.accent}18`,
                      borderColor: `${theme.accent}35`,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {topic}
                </Text>
              ))}
            </View>
          </ScrollView>
        )}

        {!!login && login !== owner && (
          <View style={styles.actionRow}>
            <SmallBtn
              icon={following.data ? "check" : "person-add"}
              label={following.data ? "Following" : "Follow"}
              onPress={() =>
                action.run(
                  () => (following.data ? unfollowUser(owner) : followUser(owner)),
                  following.refresh
                )
              }
            />
          </View>
        )}

        {!!action.error && <Text style={[styles.error, { color: theme.accentRed }]}>{action.error}</Text>}
        </View>

        {languageTotal > 0 && (
          <View style={styles.languageWrap}>
          <View style={styles.languageBar}>
            {(languages.data || []).slice(0, 5).map((lang, index) => (
              <View
                key={lang.name}
                style={{
                  flex: Math.max(0.02, lang.bytes / languageTotal),
                  height: 4,
                  backgroundColor: languageColor(lang.name, index, theme.accent),
                }}
              />
            ))}
          </View>
          <View style={styles.languageLegend}>
            {(languages.data || []).slice(0, 3).map((l, index) => (
              <View key={l.name} style={styles.legendItem}>
                <View
                  style={[
                    styles.legendDot,
                    { backgroundColor: languageColor(l.name, index, theme.accent) },
                  ]}
                />
                <Text style={[styles.languageText, { color: theme.textMuted }]} numberOfLines={1}>
                  {`${l.name} ${((l.bytes / languageTotal) * 100).toFixed(1)}%`}
                </Text>
              </View>
            ))}
          </View>
          </View>
        )}

        <View style={[styles.tabs, { borderBottomColor: theme.border }]}>
          <TabBtn label="Code" active={tab === "code"} onPress={() => setTab("code")} />
          <TabBtn label="Issues" active={tab === "issues"} onPress={() => setTab("issues")} />
          <TabBtn label="Pull requests" active={tab === "pulls"} onPress={() => setTab("pulls")} />
          <TabBtn label="Actions" active={tab === "actions"} onPress={() => setTab("actions")} />
        </View>
      </Animated.View>

      <View style={styles.body} onLayout={collapse.onBodyLayout}>
        {tab === "code" ? (
          <GitHubRepoCodeView
            repo={r}
            refName={refName}
            path={path}
            onOpenPath={setPath}
            onOpenFile={(filePath) =>
              nav.push({ name: "file", owner, repo, path: filePath, ref: refName })
            }
            onOpenBranches={onOpenBranches}
            onScroll={collapse.onScroll}
            onReadmeLayout={collapse.onReadmeLayout}
            onContentHeight={collapse.onContentHeight}
            topInset={collapse.topHeight}
            nav={nav}
          />
        ) : (
          /* Non-code tabs own their scroll views and do not feed the collapse,
             so a plain inset keeps their first row clear of the floating
             header. Shrinking their viewport costs nothing here. */
          <View style={[styles.inset, { paddingTop: collapse.topHeight }]}>
            {tab === "issues" && (
              <GitHubIssueListView owner={owner} repo={repo} nav={nav} login={login} isPull={false} />
            )}
            {tab === "pulls" && (
              <GitHubIssueListView owner={owner} repo={repo} nav={nav} login={login} isPull />
            )}
            {tab === "actions" && <GitHubActionsView owner={owner} repo={repo} />}
          </View>
        )}
      </View>
    </View>
  );
}

/** GitHub linguist colors per language; unknown languages fall back to theme-aware shades. */
const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  Java: "#b07219",
  "C++": "#f34b7d",
  C: "#555555",
  "C#": "#178600",
  Go: "#00ADD8",
  Rust: "#dea584",
  Ruby: "#701516",
  PHP: "#4F5D95",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  Dart: "#00B4AB",
  HTML: "#e34c26",
  CSS: "#563d7c",
  SCSS: "#c6538c",
  Shell: "#89e051",
  Dockerfile: "#384d54",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  Lua: "#000080",
  R: "#198CE7",
  Scala: "#c22d40",
  Haskell: "#5e5086",
  Elixir: "#6e4a7e",
  Erlang: "#B83998",
  Clojure: "#db5855",
  Zig: "#ec915c",
  Astro: "#ff5a03",
  MDX: "#fcb32c",
  Jupyter: "#DA5B0B",
  "Objective-C": "#438eff",
  "Objective-C++": "#6866fb",
  Perl: "#0298c3",
  Groovy: "#4298b8",
  PowerShell: "#012456",
  Batchfile: "#C1F12E",
  Vim: "#199f4b",
  Makefile: "#427819",
  CMake: "#DA3434",
  YAML: "#cb171e",
  TOML: "#9c4221",
  Nix: "#7e7eff",
  Terraform: "#844FBA",
  Solidity: "#AA6746",
  Move: "#4a137a",
};

function languageColor(name: string, index: number, accent: string): string {
  const known = LANGUAGE_COLORS[name];
  if (known) return known;
  const shades = [accent, "#f2cc60", "#f85149", "#a371f7", "#3fb950"];
  return shades[index % shades.length];
}

function StatBtn({
  icon,
  value,
  onPress,
}: {
  icon: string;
  value?: number;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const label = value ? (value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${value}`) : "";
  return (
    <TouchableOpacity
      style={[styles.statBtn, { borderColor: theme.border, backgroundColor: theme.bgTertiary }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Octicons name={icon as any} size={11} color={theme.textSecondary} />
      {!!label && <Text style={[styles.statText, { color: theme.textSecondary }]}>{label}</Text>}
    </TouchableOpacity>
  );
}

function SmallBtn({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      style={[
        styles.smallBtn,
        { backgroundColor: theme.bgTertiary, borderColor: theme.border },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityLabel={label}
    >
      <Octicons name={icon as any} size={13} color={theme.textSecondary} />
      <Text style={[styles.smallBtnText, { color: theme.textSecondary }]} numberOfLines={1}>
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
      <Text style={[styles.tabText, { color: active ? theme.textPrimary : theme.textSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, overflow: "hidden" },
  /** Floats over the body: lifting it never vacates screen space, so nothing
   *  can paint a bare band of the page background over the README. */
  topBlock: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 2 },
  header: {
    paddingHorizontal: 10,
    paddingTop: 7,
    paddingBottom: 6,
    gap: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  avatar: { width: 24, height: 24, borderRadius: 6, backgroundColor: "#333" },
  headerText: { flex: 1, gap: 1, minWidth: 0 },
  fullName: { fontSize: 13, fontWeight: "800" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" },
  metaText: { fontSize: 9.5 },
  statRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  statBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minWidth: 30,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statText: { fontSize: 10, fontWeight: "700" },
  description: { fontSize: 11.5, lineHeight: 15 },
  topicScroll: { flexGrow: 0 },
  topicRow: { flexDirection: "row", gap: 5, alignItems: "center" },
  topic: {
    fontSize: 9,
    fontWeight: "700",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  smallBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    height: 24,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  smallBtnText: { fontSize: 10.5, fontWeight: "600" },
  error: { fontSize: 10.5 },
  languageWrap: { paddingHorizontal: 10, paddingTop: 5, gap: 3 },
  languageBar: { flexDirection: "row", height: 3, borderRadius: 2, overflow: "hidden" },
  languageLegend: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  languageText: { fontSize: 9.5 },
  tabs: { flexDirection: "row", paddingHorizontal: 6, borderBottomWidth: StyleSheet.hairlineWidth, marginTop: 4 },
  tabBtn: { paddingVertical: 6, paddingHorizontal: 9, borderBottomWidth: 2 },
  tabText: { fontSize: 11, fontWeight: "700" },
  body: { flex: 1 },
  inset: { flex: 1 },
});