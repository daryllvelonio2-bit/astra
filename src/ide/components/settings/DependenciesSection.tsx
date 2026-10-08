import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../../theme/themeContext";
import { DependenciesScreen } from "../dependencies/DependenciesScreen";

/**
 * Settings -> Linux -> Development Dependencies.
 *
 * One native row opens the finished Dependencies screen, which lists what each
 * kind of development needs (Laravel/PHP, React/Node, Python, Flutter, ...) and
 * what the app can install for it. The section heading and collapsible card
 * reuse the Optional Extras anatomy (`settings/OptionalPackagesSection.tsx`) so
 * it reads as the same product.
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
      <Text style={[styles.sectionHeading, { color: theme.textMuted }]}>
        DEVELOPMENT DEPENDENCIES
      </Text>
      <Text style={[styles.sectionSub, { color: theme.textMuted }]}>
        What each kind of development needs — Laravel/PHP, React/Node, Python, Flutter and more —
        and what can be installed here.
      </Text>

      <View style={[styles.groupCard, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
        <TouchableOpacity
          style={styles.groupHeader}
          onPress={() => setOpen((v) => !v)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Dependencies by development kind"
          accessibilityState={{ expanded: open }}
        >
          <View style={[styles.groupBadge, { backgroundColor: `${theme.accent}18` }]}>
            <Ionicons name="cube-outline" size={15} color={theme.accent} />
          </View>
          <View style={styles.titleCol}>
            <Text style={[styles.groupTitle, { color: theme.textPrimary }]}>
              Dependencies by development kind
            </Text>
            <Text style={[styles.groupDesc, { color: theme.textMuted }]} numberOfLines={1}>
              Runtimes and tools per project type, with one-tap install
            </Text>
          </View>
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={14} color={theme.textMuted} />
        </TouchableOpacity>
      </View>

      {open && <DependenciesScreen provisioningActive={provisioningActive} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  sectionHeading: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8, marginTop: 4 },
  sectionSub: { fontSize: 11, marginTop: -4 },
  groupCard: { borderRadius: 10, borderWidth: 1, overflow: "hidden" },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
  },
  groupBadge: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  titleCol: { flex: 1 },
  groupTitle: { fontSize: 13, fontWeight: "700" },
  groupDesc: { fontSize: 10, marginTop: 1 },
});
