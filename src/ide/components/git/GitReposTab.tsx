import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { useKeyboardMouseMode } from "../../context/KeyboardMouseContext";
import { formatStale, GitHubRepo } from "../../services/gitHubProfileService";
import { searchGitHubRepos } from "../../services/gitHubSearchService";

interface GitReposTabProps {
  /** Signed-in user's repos (null = failed to load). */
  myRepos: GitHubRepo[] | null;
  /** Fires the clone flow for a repo row. */
  onCloneRepo: (repo: GitHubRepo) => void;
}

type Mode = "mine" | "search";

const SEARCH_DEBOUNCE_MS = 450;

/**
 * Repositories view of the GitHub profile popup. Empty query lists the
 * signed-in user's repos; typing searches ALL of public GitHub. Every row
 * carries a direct clone action.
 */
export function GitReposTab({ myRepos, onCloneRepo }: GitReposTabProps) {
  const { theme } = useTheme();
  const { keyboardMouseMode } = useKeyboardMouseMode();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>("mine");
  const [results, setResults] = useState<GitHubRepo[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const reqSeq = useRef(0);

  // Debounced search; stale responses are dropped by sequence number.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setMode("mine");
      setResults(null);
      setSearching(false);
      setFailed(false);
      return;
    }
    setMode("search");
    setSearching(true);
    setFailed(false);
    const seq = ++reqSeq.current;
    const timer = setTimeout(async () => {
      const res = await searchGitHubRepos(q);
      if (seq !== reqSeq.current) return; // a newer query superseded this one
      setResults(res);
      setFailed(res === null);
      setSearching(false);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const list = mode === "search" ? results || [] : myRepos || [];
  const showSpinner = mode === "search" ? searching : false;

  const renderRow = useCallback(
    (repo: GitHubRepo) => (
      <View key={repo.id} style={[styles.repoRow, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          style={styles.repoMain}
          onPress={() => onCloneRepo(repo)}
          activeOpacity={0.7}
        >
          <Octicons
            name={repo.isPrivate ? "lock" : "repo"}
            size={13}
            color={theme.textSecondary}
            style={styles.repoIcon}
          />
          <View style={styles.repoBody}>
            <Text style={[styles.repoName, { color: theme.textPrimary }]} numberOfLines={1}>
              {mode === "search" ? repo.fullName : repo.name}
            </Text>
            {!!repo.description && (
              <Text style={[styles.repoDesc, { color: theme.textSecondary }]} numberOfLines={2}>
                {repo.description}
              </Text>
            )}
            <View style={styles.repoMeta}>
              {!!repo.language && (
                <Text style={[styles.repoMetaText, { color: theme.accent }]}>{repo.language}</Text>
              )}
              {repo.stars > 0 && (
                <Text style={[styles.repoMetaText, { color: theme.textMuted }]}>★ {repo.stars}</Text>
              )}
              {repo.isFork && <Text style={[styles.repoMetaText, { color: theme.textMuted }]}>fork</Text>}
              <Text style={[styles.repoMetaText, { color: theme.textMuted }]}>{formatStale(repo.updatedAt)}</Text>
            </View>
          </View>
          <View style={[styles.cloneChip, { backgroundColor: `${theme.accent}18`, borderColor: `${theme.accent}44` }]}>
            <Octicons name="download" size={11} color={theme.accent} />
            <Text style={[styles.cloneChipText, { color: theme.accent }]}>Clone</Text>
          </View>
        </TouchableOpacity>
      </View>
    ),
    [theme, mode, onCloneRepo]
  );

  return (
    <View>
      <View style={[styles.searchBar, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
        <Octicons name="search" size={13} color={theme.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: theme.textPrimary }]}
          placeholder="Search all of GitHub..."
          placeholderTextColor={theme.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          showSoftInputOnFocus={!keyboardMouseMode}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Octicons name="x" size={13} color={theme.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {showSpinner && (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={theme.accent} />
        </View>
      )}
      {mode === "search" && failed && !searching && (
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: theme.textSecondary }]}>
            Search failed. Check your connection or try again shortly.
          </Text>
        </View>
      )}
      {mode === "mine" && myRepos === null && (
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: theme.textSecondary }]}>Could not load repositories.</Text>
        </View>
      )}
      {mode === "search" && !searching && !failed && list.length === 0 && (
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: theme.textSecondary }]}>No repositories match that search.</Text>
        </View>
      )}
      {mode === "mine" && myRepos !== null && myRepos.length === 0 && (
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: theme.textSecondary }]}>No repositories yet.</Text>
        </View>
      )}

      {list.length > 0 && (
        <ScrollView style={styles.repoList} showsVerticalScrollIndicator={false}>
          {list.map(renderRow)}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginHorizontal: 10,
    marginTop: 8,
    marginBottom: 2,
    height: 34,
    paddingHorizontal: 9,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 12.5, paddingVertical: 0 },
  center: { paddingVertical: 26, alignItems: "center", gap: 8, paddingHorizontal: 20 },
  errorText: { fontSize: 12, textAlign: "center" },
  repoList: { maxHeight: 360 },
  repoRow: {
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  repoMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  repoIcon: { marginTop: 2 },
  repoBody: { flex: 1, gap: 2 },
  repoName: { fontSize: 13, fontWeight: "700" },
  repoDesc: { fontSize: 11.5, lineHeight: 15 },
  repoMeta: { flexDirection: "row", gap: 10, flexWrap: "wrap", marginTop: 1 },
  repoMetaText: { fontSize: 10.5 },
  cloneChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cloneChipText: { fontSize: 10.5, fontWeight: "700" },
});
