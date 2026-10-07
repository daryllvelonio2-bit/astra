import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../../theme/themeContext";
import { fetchMyRepos } from "../../services/gitHubRepoService";
import { GitHubRepo } from "../../services/gitHubTypes";
import { loadGitHubSession } from "../../services/gitService";

interface MyReposListProps {
  theme: ThemeColors;
  onPick: (repo: GitHubRepo) => void;
}

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
export function MyReposList({ theme, onPick }: MyReposListProps) {
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

  const renderRepo = ({ item }: { item: GitHubRepo }) => (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: theme.bgPrimary, borderColor: theme.border }]}
      onPress={() => onPick(item)}
      activeOpacity={0.7}
    >
      <Ionicons
        name={item.isPrivate ? "lock-closed" : "globe-outline"}
        size={14}
        color={item.isPrivate ? theme.accentGold : theme.textMuted}
      />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={[styles.repoName, { color: theme.textPrimary }]} numberOfLines={1}>
            {item.name || item.fullName}
          </Text>
          {item.isPrivate && (
            <View style={[styles.badge, { backgroundColor: `${theme.accentGold}22`, borderColor: `${theme.accentGold}55` }]}>
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
          {item.owner ? `${item.owner}/` : ""}
          {item.language ? `${item.language} · ` : ""}
          {item.updatedAt ? `updated ${String(item.updatedAt).slice(0, 10)}` : "no date"}
        </Text>
        {!!item.description && (
          <Text style={[styles.repoDesc, { color: theme.textSecondary }]} numberOfLines={2}>
            {item.description}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
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
        <View style={styles.center}>
          <ActivityIndicator size="small" color={theme.accent} />
          <Text style={[styles.stateText, { color: theme.textMuted }]}>Loading your repositories…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={18} color={theme.accentRed} />
          <Text style={[styles.stateText, { color: theme.accentRed }]}>{error}</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.stateText, { color: theme.textMuted }]}>
            {repos.length === 0 ? "No repositories on this account." : "Nothing matches that filter."}
          </Text>
        </View>
      ) : (
        <>
          <Text style={[styles.countLine, { color: theme.textMuted }]}>
            {filtered.length} of {repos.length} repos
            {privateCount > 0 ? ` · ${privateCount} private` : ""}
          </Text>
          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.id || item.fullName)}
            renderItem={renderRepo}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            contentContainerStyle={styles.listContent}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
  },
  searchInput: { flex: 1, fontSize: 12.5, paddingVertical: 4 },
  countLine: { fontSize: 10.5, paddingHorizontal: 4 },
  list: { maxHeight: 260 },
  listContent: { gap: 6, paddingBottom: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  rowBody: { flex: 1, gap: 2 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  repoName: { fontSize: 12.5, fontWeight: "700", flexShrink: 1 },
  badge: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 },
  badgeText: { fontSize: 9.5, fontWeight: "700" },
  repoMeta: { fontSize: 10.5 },
  repoDesc: { fontSize: 11, lineHeight: 14 },
  center: { alignItems: "center", gap: 6, paddingVertical: 22 },
  stateText: { fontSize: 11.5, lineHeight: 16, textAlign: "center" },
});
