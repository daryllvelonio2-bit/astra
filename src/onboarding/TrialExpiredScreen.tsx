import React from "react";
import { View, Text, StyleSheet, StatusBar } from "react-native";
import { AstraLogo } from "../ide/components/AstraLogo";
import { useTheme } from "../theme/themeContext";
import { TRIAL_DAYS, type LicenseState } from "../ide/services/licenseService";

interface TrialExpiredScreenProps {
  state: LicenseState;
}

/**
 * Terminal gate shown once the trial is over. Rendered instead of the wizard /
 * project picker / IDE, so nothing else in the app is reachable.
 */
export function TrialExpiredScreen({ state }: TrialExpiredScreenProps) {
  const { theme, isDark } = useTheme();

  const endedLabel = new Date(state.expiresAt).toDateString();
  const daysAgo = Math.max(0, Math.floor((Date.now() - state.expiresAt) / (24 * 60 * 60 * 1000)));

  const tampered = state.expiredReason === "clock-tampering";
  const headline = tampered ? "Trial unavailable" : "Trial ended";
  const body = tampered
    ? "The device clock was moved back past its last recorded time, so this trial is no longer valid."
    : `Your ${TRIAL_DAYS}-day trial ended${daysAgo > 0 ? ` ${daysAgo} day${daysAgo === 1 ? "" : "s"} ago` : ""}.`;

  return (
    <View style={[styles.root, { backgroundColor: theme.bgPrimary }]}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={theme.bgPrimary}
      />

      <View style={styles.center}>
        <AstraLogo width={120} height={120} />

        <Text style={[styles.brand, { color: theme.textMuted }]}>ASTRA</Text>

        <Text style={[styles.headline, { color: theme.accentRed }]}>{headline}</Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>{body}</Text>

        <View style={[styles.card, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
          <Text style={[styles.cardLabel, { color: theme.textMuted }]}>EXPIRED ON</Text>
          <Text style={[styles.cardValue, { color: theme.textPrimary }]}>{endedLabel}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  center: {
    alignItems: "center",
  },
  brand: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 6,
    marginTop: 18,
    marginBottom: 26,
  },
  headline: {
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 10,
    maxWidth: 320,
  },
  card: {
    marginTop: 26,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
  },
  cardValue: {
    fontSize: 15,
    fontWeight: "600",
    marginTop: 4,
  },
});
