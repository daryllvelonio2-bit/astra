import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/themeContext";
import {
  searchProject,
  SearchMatch,
} from "../services/projectSearchService";

interface ProjectSearchModalProps {
  visible: boolean;
  workspaceId?: string;
  onClose: () => void;
  /** User tapped a result — open file at line (absolute guest path ok). */
  onOpenMatch: (path: string, line: number) => void;
}

function ChipToggle({
  active, label, onPress, theme,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  theme: any;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.chip,
        {
          backgroundColor: active ? `${theme.accent}22` : theme.bgTertiary,
          borderColor: active ? theme.accent : theme.border,
        },
      ]}
    >
      <Text
        style={[
          styles.chipText,
          { color: active ? theme.accent : theme.textSecondary, fontFamily: "monospace" },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function ProjectSearchModal({
  visible,
  workspaceId,
  onClose,
  onOpenMatch,
}: ProjectSearchModalProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [include, setInclude] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchMatch[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runIdRef = useRef(0);

  const fileCounts = useMemo(() => new Set((results || []).map((m) => m.path)).size, [results]);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q || !workspaceId) return;
    Keyboard.dismiss();
    const id = ++runIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await searchProject(workspaceId, {
        query: q,
        caseSensitive,
        regex,
        include: include.trim(),
      });
      if (id !== runIdRef.current) return; // a newer search superseded this one
      setResults(res.matches);
      setTruncated(res.truncated);
      if (res.error) setError(res.error);
    } catch (e: any) {
      if (id !== runIdRef.current) return;
      setError(e?.message || "Search failed");
      setResults(null);
    } finally {
      if (id === runIdRef.current) setLoading(false);
    }
  }, [query, include, caseSensitive, regex, workspaceId]);

  const handleClose = useCallback(() => {
    runIdRef.current++; // abandon in-flight results
    setLoading(false);
    onClose();
  }, [onClose]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <TouchableOpacity
        style={[styles.backdrop, { backgroundColor: theme.overlay }]}
        activeOpacity={1}
        onPress={handleClose}
      >
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.bgElevated, borderColor: theme.border, paddingBottom: Math.max(12, insets.bottom + 8) },
          ]}
          onStartShouldSetResponder={() => true}
        >
          {/* Query row */}
          <View style={styles.queryRow}>
            <View style={[styles.inputWrap, { backgroundColor: theme.bgInput, borderColor: theme.accent }]}>
              <Ionicons name="search" size={15} color={theme.textMuted} />
              <TextInput
                style={[styles.input, { color: theme.textPrimary }]}
                placeholder="Search in project..."
                placeholderTextColor={theme.textMuted}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                onSubmitEditing={runSearch}
                selectTextOnFocus
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={15} color={theme.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={[styles.goBtn, { backgroundColor: theme.accent }]}
              onPress={runSearch}
              disabled={loading || !query.trim()}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color={theme.sendButtonIcon || "#fff"} />
              ) : (
                <Text style={[styles.goBtnText, { color: theme.sendButtonIcon || "#fff" }]}>Go</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Options row: Aa / .* toggles + files-glob */}
          <View style={styles.optionsRow}>
            <ChipToggle active={caseSensitive} label="Aa" onPress={() => setCaseSensitive((v) => !v)} theme={theme} />
            <ChipToggle active={regex} label=".*" onPress={() => setRegex((v) => !v)} theme={theme} />
            <TextInput
              style={[styles.globInput, { backgroundColor: theme.bgTertiary, borderColor: theme.border, color: theme.textPrimary }]}
              placeholder="files: *.tsx"
              placeholderTextColor={theme.textMuted}
              value={include}
              onChangeText={setInclude}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              onSubmitEditing={runSearch}
            />
          </View>

          {/* Status line */}
          {error ? (
            <Text style={[styles.status, { color: theme.accentRed }]}>{error}</Text>
          ) : results ? (
            <Text style={[styles.status, { color: theme.textMuted }]}>
              {results.length} match{results.length === 1 ? "" : "es"} in {fileCounts} file{fileCounts === 1 ? "" : "s"}
              {truncated ? " (showing first 400 — refine query)" : ""}
            </Text>
          ) : null}

          {/* Results */}
          <FlatList
            style={styles.list}
            data={results || []}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={16}
            windowSize={9}
            keyExtractor={(m, i) => `${m.path}:${m.line}:${i}`}
            ListEmptyComponent={
              !loading ? (
                <View style={styles.emptyBox}>
                  <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                    {results === null
                      ? "Type a query and press Go or the keyboard search key."
                      : "No matches."}
                  </Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.resultRow}
                activeOpacity={0.7}
                onPress={() => {
                  handleClose();
                  onOpenMatch(item.path, item.line);
                }}
              >
                <Text style={[styles.resultPath, { color: theme.accent }]} numberOfLines={1}>
                  {item.path}
                  <Text style={{ color: theme.textMuted }}>{`:${item.line}`}</Text>
                </Text>
                <Text style={[styles.resultText, { color: theme.textSecondary }]} numberOfLines={1}>
                  {item.text}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    marginHorizontal: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 12,
    paddingTop: 12,
    maxHeight: "80%",
  },
  queryRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 40,
  },
  input: { flex: 1, fontSize: 14, fontFamily: "monospace", paddingVertical: 0 },
  goBtn: { paddingHorizontal: 14, height: 40, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  goBtnText: { fontSize: 13, fontWeight: "700" },
  optionsRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: "600" },
  globInput: {
    flex: 1,
    height: 30,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 12,
    fontFamily: "monospace",
    paddingVertical: 0,
  },
  status: { fontSize: 11, marginTop: 8, fontFamily: "monospace" },
  list: { marginTop: 6, minHeight: 120 },
  resultRow: { paddingVertical: 7, paddingHorizontal: 2, gap: 2 },
  resultPath: { fontSize: 12, fontFamily: "monospace" },
  resultText: { fontSize: 12, fontFamily: "monospace", opacity: 0.9 },
  emptyBox: { paddingVertical: 24, alignItems: "center" },
  emptyText: { fontSize: 12 },
});
