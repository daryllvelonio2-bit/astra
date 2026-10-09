import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../../theme/themeContext";
import { DependenciesScreen } from "../dependencies/DependenciesScreen";

/**
 * Settings -> Linux -> Development Dependencies.
 *
 * ONE rounded container: the title row is the container's heading, and the
 * dependencies list sits flat inside it — group rows and tool rows divided by
 * hairlines, no card inside a card, nothing hidden behind a tap.
 *
 * The list is mounted straight away, so its one-shot probe runs on land exactly
 * as before. Nothing installs on its own; the screen only ever calls the app's
 * existing guest installer after a tap.
 */

interface DependenciesSectionProps {
  theme: ThemeColors;
  /** True while base provisioning runs — installs disabled (apt lock). */
  provisioningActive: boolean;
}

export function DependenciesSection({ theme, provisioningActive }: DependenciesSectionProps) {
  return (
    <View style={[styles.card, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
      {/* Title row — the container's heading, always on screen. */}
      <View style={styles.headerRow}>
        <View style={[styles.iconTile, { backgroundColor: `${theme.accent}18`, borderColor: `${theme.accent}2E` }]}>
          <Ionicons name="cube-outline" size={16} color={theme.accent} />
        </View>
        <View style={styles.titleCol}>
          <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>
            Development Dependencies
          </Text>
          <Text style={[styles.meta, { color: theme.textMuted }]} numberOfLines={1}>
            Runtimes and tools per project type — install what you need
          </Text>
        </View>
      </View>

      <DependenciesScreen provisioningActive={provisioningActive} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 8 },
  iconTile: {
    width: 34,
    height: 34,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  titleCol: { flex: 1 },
  title: { fontSize: 12, fontWeight: "700" },
  meta: { fontSize: 10.5, marginTop: 1 },
});
