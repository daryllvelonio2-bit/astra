import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../../theme/themeContext";
import { DependenciesScreen } from "../dependencies/DependenciesScreen";

/**
 * Settings -> Linux -> Development Dependencies.
 *
 * One row — the option — opens the Dependencies screen, which lists what each
 * kind of development needs (Laravel/PHP, React/Node, Python, Flutter, ...) and
 * what the app can install for it. No section heading above it: the row's own
 * title is the only heading, and it sits flat against the settings list.
 *
 * It starts EXPANDED, so the tools are on screen the moment the settings tab
 * lands — nothing is hidden behind a tap. The header row stays as a collapse
 * control for when the user is done with the (long) list.
 *
 * Mounting the screen starts its own one-shot probe; collapsing unmounts it and
 * discards that state — so nothing is left running and nothing installs on its
 * own.
 */

interface DependenciesSectionProps {
  theme: ThemeColors;
  /** True while base provisioning runs — installs disabled (apt lock). */
  provisioningActive: boolean;
}

export function DependenciesSection({ theme, provisioningActive }: DependenciesSectionProps) {
  // Open on land: the dependencies are visible without a tap. The row remains a
  // collapse control so a user who is finished can tuck the long list away.
  const [open, setOpen] = useState(true);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.row, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}
        onPress={() => setOpen((v) => !v)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Development dependencies"
        accessibilityState={{ expanded: open }}
      >
        <View style={[styles.iconTile, { backgroundColor: `${theme.accent}18`, borderColor: `${theme.accent}2E` }]}>
          <Ionicons name="cube-outline" size={16} color={theme.accent} />
        </View>
        <View style={styles.titleCol}>
          <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>
            Development Dependencies
          </Text>
          <Text style={[styles.meta, { color: theme.textMuted }]} numberOfLines={1}>
            Runtimes and tools per project type — tap to install
          </Text>
        </View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={14} color={theme.textMuted} />
      </TouchableOpacity>

      {open && <DependenciesScreen provisioningActive={provisioningActive} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  iconTile: {
    width: 34,
    height: 34,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  titleCol: { flex: 1 },
  title: { fontSize: 13, fontWeight: "700" },
  meta: { fontSize: 11, marginTop: 1 },
});
