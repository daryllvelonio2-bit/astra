import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../../theme/themeContext";

/**
 * "Full features" plan screen (Settings -> Full features).
 *
 * Payments are NOT wired up: there is no provider, no API key and no server
 * behind this screen, so it cannot charge anyone and cannot unlock anything.
 * That is deliberate — it exists so testers can see where the upgrade will
 * live. Keep it honest: no price, no plan tiers, and no button that looks like
 * it works. The unlock action belongs here once a provider is chosen.
 */
export function PlanSection({ theme }: { theme: ThemeColors }) {
  return (
    <View>
      <Text style={[styles.heading, { color: theme.textMuted }]}>FULL FEATURES</Text>

      <View style={[styles.card, { backgroundColor: theme.bgPrimary, borderColor: theme.border }]}>
        <View style={[styles.iconBox, { backgroundColor: `${theme.accentGold}1F` }]}>
          <Ionicons name="diamond-outline" size={18} color={theme.accentGold} />
        </View>
        <View style={styles.labels}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Full features</Text>
          <Text style={[styles.sub, { color: theme.textSecondary }]}>Payment is coming soon.</Text>
        </View>
        <View
          style={[
            styles.badge,
            { backgroundColor: `${theme.accentGold}22`, borderColor: `${theme.accentGold}55` },
          ]}
        >
          <Text style={[styles.badgeText, { color: theme.accentGold }]}>COMING SOON</Text>
        </View>
      </View>

      <View style={styles.noteBlock}>
        <View style={styles.noteRow}>
          <Ionicons name="information-circle-outline" size={13} color={theme.textMuted} />
          <Text style={[styles.noteText, { color: theme.textMuted }]}>
            Nothing is charged today and this screen cannot unlock anything yet — it is a
            placeholder so you know where the upgrade will live.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8, marginTop: 6, marginBottom: 6 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  iconBox: { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  labels: { flex: 1, gap: 2 },
  title: { fontSize: 13.5, fontWeight: "700" },
  sub: { fontSize: 11 },
  badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  badgeText: { fontSize: 9, fontWeight: "700", letterSpacing: 0.6 },
  noteBlock: { marginTop: 10, paddingHorizontal: 2 },
  noteRow: { flexDirection: "row", alignItems: "flex-start", gap: 5 },
  noteText: { flex: 1, fontSize: 10.5, lineHeight: 14 },
});
