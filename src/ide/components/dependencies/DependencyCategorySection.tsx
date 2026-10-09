import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../../theme/themeContext";
import { DevCategory, DevTool, readyCount } from "../../services/devCategories";
import { DependencyToolRow } from "./DependencyToolRow";

/**
 * One kind of development as a flat group inside the parent's single container:
 * a quiet title row (icon · name · ready count) over its tool rows, separated
 * from the next group by a hairline rule. No card, no badge box, no collapse —
 * the tool rows stay the loudest thing on the screen and are always visible.
 */

interface DependencyCategorySectionProps {
  category: DevCategory;
  theme: ThemeColors;
  installed: Record<string, boolean>;
  busy: Record<string, boolean>;
  probing: boolean;
  provisioningActive: boolean;
  onInstall: (tool: DevTool) => void;
}

export function DependencyCategorySection({
  category,
  theme,
  installed,
  busy,
  probing,
  provisioningActive,
  onInstall,
}: DependencyCategorySectionProps) {
  const total = category.tools.length;
  const ready = readyCount(category, installed);
  const allDone = ready === total;

  return (
    <View style={[styles.section, { borderTopColor: theme.border }]}>
      <View style={styles.header}>
        <Ionicons name={category.icon as any} size={14} color={theme.textMuted} />
        <Text style={[styles.title, { color: theme.textMuted }]} numberOfLines={1}>
          {category.name}
        </Text>
        <View style={styles.spacer} />
        {probing ? (
          <ActivityIndicator size={11} color={theme.textMuted} />
        ) : (
          <Text style={[styles.count, { color: allDone ? theme.accentGreen : theme.textMuted }]}>
            {allDone ? "Ready" : `${ready}/${total}`}
          </Text>
        )}
      </View>

      <View style={styles.toolList}>
        {category.tools.map((tool) => (
          <DependencyToolRow
            key={tool.id}
            tool={tool}
            theme={theme}
            installed={installed[tool.id]}
            busy={!!busy[tool.id]}
            provisioningDisabled={provisioningActive}
            onInstall={onInstall}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  header: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
  title: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  spacer: { flex: 1 },
  count: { fontSize: 11, fontWeight: "600" },
  toolList: { gap: 6, paddingTop: 2, paddingBottom: 6 },
});
