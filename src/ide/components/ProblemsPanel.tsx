import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CodeDiagnostic } from "../services/codeDiagnosticsService";
import { useTheme } from "../../theme/themeContext";

interface ProblemsPanelProps {
  diagnostics: CodeDiagnostic[];
  onJumpToLine: (line: number) => void;
  onClose?: () => void;
}

const MAX_ROWS = 30;

export function ProblemsPanel({ diagnostics, onJumpToLine, onClose }: ProblemsPanelProps) {
  const { theme } = useTheme();
  const [collapsed, setCollapsed] = React.useState(false);
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.length - errors;

  if (diagnostics.length === 0) {
    return (
      <View style={[styles.cleanBar, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
        <Ionicons name="checkmark-circle" size={12} color={theme.accentGreen} />
        <Text style={[styles.cleanText, { color: theme.accentGreen, flex: 1 }]}>No problems</Text>
        {onClose && (
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={14} color={theme.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setCollapsed(!collapsed)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <Ionicons name={collapsed ? "chevron-down" : "chevron-up"} size={12} color={theme.textMuted} />
          {errors > 0 && (
            <View style={[styles.countBadge, { backgroundColor: `${theme.accentRed}20` }]}>
              <Text style={[styles.countText, { color: theme.accentRed }]}>{errors} error{errors > 1 ? "s" : ""}</Text>
            </View>
          )}
          {warnings > 0 && (
            <View style={[styles.countBadge, { backgroundColor: `${theme.accentGold}20` }]}>
              <Text style={[styles.countText, { color: theme.accentGold }]}>{warnings} warning{warnings > 1 ? "s" : ""}</Text>
            </View>
          )}
        </View>
        <View style={styles.headerRight}>
          <Text style={[styles.hint, { color: theme.textMuted }]}>tap to jump</Text>
          {onClose && (
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={14} color={theme.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>

      {!collapsed && (
        <ScrollView style={styles.list} nestedScrollEnabled showsVerticalScrollIndicator={false}>
          {diagnostics.slice(0, MAX_ROWS).map((d, idx) => {
            const isErr = d.severity === "error";
            const color = isErr ? theme.accentRed : theme.accentGold;
            return (
              <TouchableOpacity
                key={`${d.line}-${d.col}-${idx}`}
                style={[styles.row, { borderBottomColor: theme.border }]}
                onPress={() => onJumpToLine(d.line)}
                activeOpacity={0.6}
              >
                <Ionicons
                  name={isErr ? "alert-circle" : "warning-outline"}
                  size={12}
                  color={color}
                  style={styles.rowIcon}
                />
                <Text style={[styles.rowPos, { color }]}>{d.line}:{d.col}</Text>
                <Text style={[styles.rowMsg, { color: theme.textPrimary }]} numberOfLines={2}>
                  {d.message}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cleanBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  cleanText: { fontSize: 11, fontWeight: "600" },
  container: { borderTopWidth: 1, borderBottomWidth: 1, maxHeight: 148 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  countBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  countText: { fontSize: 10.5, fontWeight: "700" },
  hint: { fontSize: 10, fontStyle: "italic" },
  list: { maxHeight: 112 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderBottomWidth: 1,
    gap: 6,
  },
  rowIcon: { marginTop: 1 },
  rowPos: { fontFamily: "monospace", fontSize: 10.5, fontWeight: "700", minWidth: 40 },
  rowMsg: { flex: 1, fontSize: 11, lineHeight: 15 },
});
