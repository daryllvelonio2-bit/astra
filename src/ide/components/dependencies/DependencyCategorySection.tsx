import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../../theme/themeContext";
import { DevCategory, DevTool, readyCount } from "../../services/devCategories";
import { DependencyToolRow } from "./DependencyToolRow";

/**
 * One kind of development as a titled, collapsible card whose rows are its
 * tools. The header/card/list metrics deliberately copy the settings
 * Optional Extras group card so the two read as the same product.
 */

interface DependencyCategorySectionProps {
  category: DevCategory;
  theme: ThemeColors;
  installed: Record<string, boolean>;
  busy: Record<string, boolean>;
  probing: boolean;
  provisioningActive: boolean;
  expanded: boolean;
  onToggle: () => void;
  onInstall: (tool: DevTool) => void;
}

export function DependencyCategorySection({
  category,
  theme,
  installed,
  busy,
  probing,
  provisioningActive,
  expanded,
  onToggle,
  onInstall,
}: DependencyCategorySectionProps) {
  const total = category.tools.length;
  const ready = readyCount(category, installed);
  const allDone = ready === total;

  return (
    <View
      style={[
        styles.groupCard,
        { backgroundColor: theme.bgSecondary, borderColor: allDone ? `${theme.accentGreen}40` : theme.border },
      ]}
    >
      <TouchableOpacity style={styles.groupHeader} onPress={onToggle} activeOpacity={0.7}>
        <View style={styles.groupLeft}>
          <View style={[styles.groupBadge, { backgroundColor: `${theme.accent}18` }]}>
            <Ionicons name={category.icon as any} size={15} color={theme.accent} />
          </View>
          <View style={styles.titleCol}>
            <Text style={[styles.groupTitle, { color: theme.textPrimary }]}>{category.name}</Text>
            <Text style={[styles.groupDesc, { color: theme.textMuted }]} numberOfLines={1}>
              {category.purpose}
            </Text>
          </View>
        </View>
        <View style={styles.groupRight}>
          {probing ? (
            <ActivityIndicator size={12} color={theme.textMuted} />
          ) : (
            <Text style={[styles.groupCount, { color: allDone ? theme.accentGreen : theme.textMuted }]}>
              {allDone ? "Ready" : `${ready}/${total}`}
            </Text>
          )}
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color={theme.textMuted} />
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={[styles.packageList, { borderTopColor: theme.border }]}>
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  groupCard: { borderRadius: 10, borderWidth: 1, overflow: "hidden" },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
  },
  groupLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  groupBadge: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  titleCol: { flex: 1 },
  groupTitle: { fontSize: 13, fontWeight: "700" },
  groupDesc: { fontSize: 10, marginTop: 1 },
  groupRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  groupCount: { fontSize: 11, fontWeight: "600" },
  packageList: { borderTopWidth: 1, padding: 10, gap: 10 },
});
