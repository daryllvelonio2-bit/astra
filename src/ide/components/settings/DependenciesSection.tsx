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
 * The screen is mounted only while the row is open: opening starts its own
 * one-shot probe, closing unmounts it and discards that state — so nothing is
 * left running and nothing installs on its own.
 */

interface DependenciesSectionProps {
  theme: ThemeColors;
  /** True while base provisioning runs — installs disabled (apt lock). */
  provisioningActive: boolean;
}

export function DependenciesSection({ theme, provisioningActive }: DependenciesSectionProps) {
  const [open, setOpen] = useState(false);

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
        <Ionicons name="cube-outline" size={16} color={theme.accent} />
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
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  titleCol: { flex: 1 },
  title: { fontSize: 13, fontWeight: "700" },
  meta: { fontSize: 11, marginTop: 1 },
});
