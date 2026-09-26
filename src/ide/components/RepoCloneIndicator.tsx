import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../theme/themeContext";
import {
  getRepoCloneState,
  subscribeRepoClone,
  cancelRepoClone,
  RepoCloneState,
} from "../services/repoCloneCoordinator";

/**
 * App-level clone status: renders at the top-left of whatever screen is
 * open (picker, IDE, any tab), above everything else. Text only — no
 * background boxes, per the standing minimal-UI rule. Tap Cancel to abort.
 */
export function RepoCloneIndicator() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<RepoCloneState>(getRepoCloneState());

  useEffect(() => subscribeRepoClone(setState), []);

  if (!state.repo) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { top: insets.top + 6, left: 10 }]}
    >
      <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>
        Cloning {state.repo.fullName || state.repo.name}
        {state.pct !== null ? ` · ${state.pct}%` : ""}
      </Text>
      {!!state.lastLine && (
        <Text style={[styles.line, { color: theme.textMuted }]} numberOfLines={1}>
          {state.lastLine}
        </Text>
      )}
      <TouchableOpacity onPress={cancelRepoClone} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={[styles.cancel, { color: theme.accentRed }]}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", zIndex: 999, maxWidth: "70%", gap: 2, alignItems: "flex-start" },
  title: { fontSize: 11.5, fontWeight: "700" },
  line: { fontSize: 10 },
  cancel: { fontSize: 11.5, fontWeight: "700" },
});
