import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../../theme/themeContext";
import { fetchMyRepos } from "../../services/gitHubRepoService";
import { GitHubRepo } from "../../services/gitHubTypes";
import { loadGitHubSession } from "../../services/gitService";
import { formatStale } from "../../services/gitHubProfileService";

interface MyReposListProps {
  theme: ThemeColors;
  onPick: (repo: GitHubRepo) => void;
  /**
   * Take the height it is given and scroll inside it, instead of sizing to a
   * max height. Used when this list IS the sheet body: the parent supplies a
   * definite height, so the list is a locked viewport and the drag cannot be
   * stolen by an enclosing ScrollView.
   */
  fill?: boolean;
  /** Highlight the row that is currently selected. */
  selectedFullName?: string;
}

/** Owner avatar with an initials fallback so a slow/absent image never blanks the row. */
function OwnerAvatar({ uri, login, theme }: { uri?: string; login?: string; theme: ThemeColors }) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[styles.avatar, { borderColor: theme.border, backgroundColor: theme.bgTertiary }]}
      />
    );
  }
  return (
    <View
      style={[
        styles.avatar,
        styles.avatarFallback,
        { backgroundColor: `${theme.accent}30`, borderColor: theme.border },
      ]}
    >
      <Text style={[styles.avatarLetter, { color: theme.accent }]}>
        {(login || "?").slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

/** Placeholder row shown while the account's repos load — mirrors the real row's shape. */
function SkeletonRow({ theme }: { theme: ThemeColors }) {
  const block = { backgroundColor: theme.bgTertiary };
  return (
    <View style={[styles.row, { backgroundColor: theme.bgPrimary, borderColor: theme.border }]}>
      <View style={[styles.avatar, block]} />
      <View style={styles.rowBody}>
        <View style={[styles.skelLine, styles.skelTitle, block]} />
        <View style={[styles.skelLine, styles.skelMeta, block]} />
        <View style={[styles.skelLine, styles.skelDesc, block]} />
      </View>
    </View>
  );
}

const SKELETON_ROWS = [0, 1, 2, 3, 4, 5];

/**
 * The signed-in account's repositories, so a clone can start from a tap instead
 * of a pasted URL.
 *
 * Visibility: `fetchMyRepos()` asks GitHub for
 * `affiliation=owner,collaborator,organization_member` with the `repo` scope,
 * which returns PRIVATE repos too — the account's own private repos are the
 * whole point here, so nothing filters on `isPrivate`. (Restricting scope or
 * dropping `affiliation` is what would hide them; do not "simplify" that call.)
 */
export function MyReposList({ theme, onPick, fill, selectedFullName }: MyReposListProps) {
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const session = await loadGitHubSession();
      if (!session) {
        setRepos([]);
        setError("Sign in to GitHub first — then your repos appear here.");
        return;
      }
      // Read the result defensively: this project's tsconfig does not narrow
      // boolean-literal unions, so `res.error` on an `ok: true` branch is a
      // type error here.
      const res: any = await fetchMyRepos("updated", 100);
      if (!res || !res.ok) {
        setRepos([]);
        setError(res?.error || "Could not load your repositories.");
        return;
      }
      setRepos(Array.isArray(res.data) ? res.data : []);
    } catch (e: any) {
      setRepos([]);
      setError(e?.message || "Could not load your repositories.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q) ||
        (r.language || "").toLowerCase().includes(q)
    );
  }, [repos, query]);

  const privateCount = useMemo(() => repos.filter((r) => r.isPrivate).length, [repos]);

  const renderRepo = ({ item }: { item: GitHubRepo }) => {
    const selected = !!selectedFullName && selectedFullName === item.fullName;
    return (
      <TouchableOpacity
        style={[
          styles.row,
          { backgroundColor: theme.bgPrimary, borderColor: theme.border },
          selected && { borderColor: theme.accent, backgroundColor: `${theme.accent}14` },
        ]}
        onPress={() => onPick(item)}
        activeOpacity={0.7}
      >
        <OwnerAvatar uri={item.ownerAvatar} login={item.owner} theme={theme} />
        <View style={styles.rowBody}>
          <View style={styles.rowTop}>
            <Text style={[styles.repoName, { color: theme.textPrimary }]} numberOfLines={1}>
              {item.name || item.fullName}
            </Text>
            {item.isPrivate && (
              <View style={[styles.badge, { backgroundColor: `${theme.accentGold}22`, borderColor: `${theme.accentGold}55` }]}>
                <Ionicons name="lock-closed" size={8} color={theme.accentGold} />
                <Text style={[styles.badgeText, { color: theme.accentGold }]}>private</Text>
              </View>
            )}
            {item.isFork && (
              <View style={[styles.badge, { backgroundColor: theme.bgTertiary, borderColor: theme.border }]}>
                <Text style={[styles.badgeText, { color: theme.textMuted }]}>fork</Text>
              </View>
            )}
          </View>
          <Text style={[styles.repoMeta, { color: theme.textMuted }]} numberOfLines={1}>
            {item.fullName}
            {item.language ? ` · ${item.language}` : ""}
            {item.updatedAt ? ` · updated ${formatStale(item.updatedAt)}` : ""}
          </Text>
          {!!item.description && (
            <Text style={[styles.repoDesc, { color: theme.textSecondary }]} numberOfLines={1}>
              {item.description}
            </Text>
          )}
        </View>
        <Ionicons
          name={selected ? "checkmark-circle" : "chevron-forward"}
          size={selected ? 18 : 14}
          color={selected ? theme.accent : theme.textMuted}
        />
      </TouchableOpacity>
    );
  };

  const stateStyle = [styles.center, fill ? styles.centerFill : null];

  return (
    <View style={[styles.container, fill ? styles.containerFill : null]}>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={14} color={theme.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: theme.textPrimary }]}
          placeholder="Filter your repositories…"
          placeholderTextColor={theme.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity onPress={() => void load()} activeOpacity={0.7} accessibilityLabel="Reload repositories">
          <Ionicons name="refresh" size={16} color={theme.accent} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View
          style={styles.skeletonList}
          accessibilityLabel="Loading your repositories"
        >
          {SKELETON_ROWS.map((i) => (
            <SkeletonRow key={i} theme={theme} />
          ))}
        </View>
      ) : error ? (
        <View style={stateStyle}>
          <Ionicons name="alert-circle-outline" size={18} color={theme.accentRed} />
          <Text style={[styles.stateText, { color: theme.accentRed }]}>{error}</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={stateStyle}>
          <Ionicons name="search-outline" size={18} color={theme.textMuted} />
          <Text style={[styles.stateText, { color: theme.textMuted }]}>
            {repos.length === 0
              ? "No repositories on this account."
              : "No repositories found for that search."}
          </Text>
        </View>
      ) : (
        <>
          <Text style={[styles.countLine, { color: theme.textMuted }]}>
            {filtered.length} of {repos.length} repos
            {privateCount > 0 ? ` · ${privateCount} private` : ""}
            {" · tap one, then Clone below"}
          </Text>
          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.id || item.fullName)}
            renderItem={renderRepo}
            keyboardShouldPersistTaps="handled"
            // The list is the only scrollable inside the sheet body, and the
            // parent gives it a definite height, so it scrolls. Keep
            // nestedScrollEnabled for safety if this is ever nested again — it
            // costs nothing and is the difference between a usable list and one
            // that silently refuses to move on Android.
            nestedScrollEnabled
            style={fill ? styles.listFill : styles.list}
            contentContainerStyle={styles.listContent}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8, paddingHorizontal: 16 },
  containerFill: { flex: 1 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
  },
  searchInput: { flex: 1, fontSize: 12.5, paddingVertical: 4 },
  countLine: { fontSize: 10.5, paddingHorizontal: 4 },
  // Sized mode (inside a ScrollView): cap the height and scroll within it.
  list: { maxHeight: 380 },
  // Fill mode (this list IS the sheet body): take the height given and scroll.
  listFill: { flex: 1 },
  listContent: { gap: 6, paddingBottom: 8 },
  skeletonList: { gap: 6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  avatar: { width: 30, height: 30, borderRadius: 15, borderWidth: 1 },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarLetter: { fontSize: 12, fontWeight: "800" },
  rowBody: { flex: 1, gap: 2 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  repoName: { fontSize: 12.5, fontWeight: "700", flexShrink: 1 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeText: { fontSize: 9.5, fontWeight: "700" },
  repoMeta: { fontSize: 10.5 },
  repoDesc: { fontSize: 11 },
  skelLine: { height: 8, borderRadius: 4 },
  skelTitle: { width: "55%" },
  skelMeta: { width: "35%", height: 7 },
  skelDesc: { width: "80%", height: 7 },
  center: { alignItems: "center", gap: 6, paddingVertical: 22 },
  centerFill: { flex: 1, justifyContent: "center" },
  stateText: { fontSize: 11.5, lineHeight: 16, textAlign: "center" },
});
