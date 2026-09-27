import React, { useState } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
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
  onOpenBranches: (ref: string) => void;
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

  const refName = ref || detail.data?.defaultBranch || "main";
  const languageTotal = (languages.data || []).reduce((sum, l) => sum + l.bytes, 0);

  if (detail.loading && !detail.data) return <LoadingState />;
  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.refresh} />;
  if (!detail.data) return null;

  const r = detail.data;

  return (
    <View style={styles.wrap}>
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
                size={10}
                color={theme.textMuted}
              />
              <Text style={[styles.metaText, { color: theme.textMuted }]}>{r.visibility}</Text>
              {!!r.license && <Text style={[styles.metaText, { color: theme.textMuted }]}>{r.license}</Text>}
              <Text style={[styles.metaText, { color: theme.textMuted }]}>updated {formatStale(r.updatedAt)}</Text>
            </View>
          </View>
        </View>

        {!!r.description && (
          <Text style={[styles.description, { color: theme.textSecondary }]} numberOfLines={3}>
            {r.description}
          </Text>
        )}

        <View style={styles.actionRow}>
          <CountChip icon="star" label="Star" value={r.stars} onPress={() => action.run(() => starRepo(owner, repo), detail.refresh)} />
          <CountChip icon="repo-forked" label="Fork" value={r.forks} onPress={() => action.run(() => forkRepo(owner, repo), detail.refresh)} />
          <CountChip icon="eye" label="Watch" onPress={() => action.run(() => watchRepo(owner, repo))} />
          <CountChip
            icon="download"
            label="Clone"
            onPress={() => onCloneRepo(r.fullName)}
            accent
          />
        </View>

        <View style={styles.actionRow}>
          <SmallBtn
            icon="git-branch"
            label={refName}
            onPress={() => onOpenBranches(refName)}
          />
          {!!login && login !== owner && (
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
          )}
          <SmallBtn icon="history" label="Commits" onPress={() => nav.push({ name: "commits", owner, repo, ref: refName })} />
          <SmallBtn icon="tag" label="Releases" onPress={() => nav.push({ name: "releases", owner, repo })} />
          <SmallBtn
            icon="gear"
            label="Settings"
            onPress={() => nav.push({ name: "repoSettings", owner, repo })}
          />
          <SmallBtn icon="people" label="Contributors" onPress={() => nav.push({ name: "contributors", owner, repo })} />
        </View>

        {!!action.error && <Text style={[styles.error, { color: theme.accentRed }]}>{action.error}</Text>}

        {!!r.homepage && (
          <Text style={[styles.homepage, { color: theme.accent }]} numberOfLines={1}>
            {r.homepage}
          </Text>
        )}
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
                  backgroundColor: languageShade(index, theme.accent),
                }}
              />
            ))}
          </View>
          <Text style={[styles.languageText, { color: theme.textMuted }]} numberOfLines={1}>
            {(languages.data || [])
              .slice(0, 3)
              .map((l) => `${l.name} ${((l.bytes / languageTotal) * 100).toFixed(1)}%`)
              .join(" · ")}
          </Text>
        </View>
      )}

      <View style={[styles.tabs, { borderBottomColor: theme.border }]}>
        <TabBtn label="Code" active={tab === "code"} onPress={() => setTab("code")} />
        <TabBtn label="Issues" active={tab === "issues"} onPress={() => setTab("issues")} />
        <TabBtn label="Pull requests" active={tab === "pulls"} onPress={() => setTab("pulls")} />
        <TabBtn label="Actions" active={tab === "actions"} onPress={() => setTab("actions")} />
      </View>

      <View style={styles.body}>
        {tab === "code" && (
          <GitHubRepoCodeView
            repo={r}
            refName={refName}
            path={path}
            onOpenPath={setPath}
            onOpenFile={(filePath) =>
              nav.push({ name: "file", owner, repo, path: filePath, ref: refName })
            }
          />
        )}
        {tab === "issues" && (
          <GitHubIssueListView owner={owner} repo={repo} nav={nav} login={login} isPull={false} />
        )}
        {tab === "pulls" && (
          <GitHubIssueListView owner={owner} repo={repo} nav={nav} login={login} isPull />
        )}
        {tab === "actions" && <GitHubActionsView owner={owner} repo={repo} />}
      </View>
    </View>
  );
}

function languageShade(index: number, accent: string): string {
  const shades = [accent, "#f2cc60", "#f85149", "#a371f7", "#3fb950"];
  return shades[index % shades.length];
}

function CountChip({
  icon,
  label,
  value,
  onPress,
  accent,
}: {
  icon: string;
  label: string;
  value?: number;
  onPress: () => void;
  accent?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        {
          backgroundColor: accent ? theme.accent : theme.bgTertiary,
          borderColor: accent ? theme.accent : theme.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Octicons name={icon as any} size={11} color={accent ? "#fff" : theme.textSecondary} />
      <Text style={[styles.chipText, { color: accent ? "#fff" : theme.textSecondary }]}>{label}</Text>
      {value !== undefined && value > 0 && (
        <Text style={[styles.chipValue, { color: accent ? "#fff" : theme.textMuted }]}>
          {value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}
        </Text>
      )}
    </TouchableOpacity>
  );
}

function SmallBtn({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity style={styles.smallBtn} onPress={onPress} activeOpacity={0.7}>
      <Octicons name={icon as any} size={11} color={theme.textSecondary} />
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
  wrap: { flex: 1 },
  header: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 30, height: 30, borderRadius: 6, backgroundColor: "#333" },
  headerText: { flex: 1, gap: 2 },
  fullName: { fontSize: 13.5, fontWeight: "800" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  metaText: { fontSize: 10 },
  description: { fontSize: 11.5, lineHeight: 16 },
  actionRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    height: 28,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontSize: 11, fontWeight: "700" },
  chipValue: { fontSize: 10.5, fontWeight: "700" },
  smallBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    height: 24,
    borderRadius: 6,
  },
  smallBtnText: { fontSize: 10.5, fontWeight: "600" },
  error: { fontSize: 11 },
  homepage: { fontSize: 10.5 },
  languageWrap: { paddingHorizontal: 12, paddingTop: 8, gap: 4 },
  languageBar: { flexDirection: "row", height: 4, borderRadius: 2, overflow: "hidden" },
  languageText: { fontSize: 10 },
  tabs: { flexDirection: "row", paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, marginTop: 6 },
  tabBtn: { paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 2 },
  tabText: { fontSize: 11.5, fontWeight: "700" },
  body: { flex: 1 },
});