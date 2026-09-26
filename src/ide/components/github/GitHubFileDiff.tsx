import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { GitHubPullFile } from "../../services/gitHubTypes";

/**
 * One file in a PR's "Files changed": collapsed by default so a 40-file PR
 * stays scannable, expanding to a coloured patch. Patch text is plain —
 * no syntax highlighting, no extra dependency.
 */

export function GitHubFileDiff({ file }: { file: GitHubPullFile }) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const statusColor =
    file.status === "added" ? theme.accentGreen : file.status === "removed" ? theme.accentRed : theme.accentGold;

  const lines = (file.patch || "").split("\n");

  return (
    <View style={[styles.wrap, { borderBottomColor: theme.border }]}>
      <TouchableOpacity
        style={styles.head}
        onPress={() => setOpen((v) => !v)}
        activeOpacity={0.7}
      >
        <Octicons name={open ? "chevron-down" : "chevron-right"} size={12} color={theme.textMuted} />
        <Text style={[styles.path, { color: theme.textPrimary }]} numberOfLines={1}>
          {file.filename}
        </Text>
        <Text style={[styles.stat, { color: statusColor }]}>{file.status}</Text>
        <Text style={[styles.stat, { color: theme.accentGreen }]}>+{file.additions}</Text>
        <Text style={[styles.stat, { color: theme.accentRed }]}>-{file.deletions}</Text>
      </TouchableOpacity>

      {open && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.patch}>
            {lines.map((line, index) => {
              const kind = line.startsWith("@@")
                ? "hunk"
                : line.startsWith("+")
                ? "add"
                : line.startsWith("-")
                ? "del"
                : "ctx";
              const color =
                kind === "add"
                  ? theme.accentGreen
                  : kind === "del"
                  ? theme.accentRed
                  : kind === "hunk"
                  ? theme.accentCyan
                  : theme.textSecondary;
              return (
                <Text key={index} style={[styles.patchLine, { color }]}>
                  {line || " "}
                </Text>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: StyleSheet.hairlineWidth },
  head: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  path: { flex: 1, fontSize: 11.5, fontWeight: "700" },
  stat: { fontSize: 10, fontWeight: "700" },
  patch: { paddingHorizontal: 12, paddingBottom: 10 },
  patchLine: { fontSize: 11, fontFamily: "monospace" },
});