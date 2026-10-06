import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { ThemeColors } from "../../../theme/themeContext";

/**
 * Support the project (Settings -> Support).
 *
 * A "Buy Me a Coffee" link, NOT a payment integration: tapping opens the
 * creator page in the in-app browser and the user pays there. This app never
 * touches a card, holds no provider key and talks to no backend, so there is
 * nothing in the APK to extract and nothing to break.
 *
 * The one thing it CANNOT do is unlock anything. A tip link tells the app
 * nothing about who paid, so "pay to unlock full features" would need Google
 * Play Billing (which requires the app to be published on Play — this one is
 * sideloaded) or a licence server that verifies a purchase. Keep the copy on
 * this screen honest about that: it is a tip jar.
 */
export const SUPPORT_URL = "";

const SUPPORT_HOST = "buymeacoffee.com";

export function isSupportConfigured(url: string = SUPPORT_URL): boolean {
  return /^https:\/\/\S+$/i.test((url || "").trim());
}

export function SupportSection({ theme }: { theme: ThemeColors }) {
  const configured = isSupportConfigured();

  const open = async () => {
    if (!configured) return;
    try {
      await WebBrowser.openBrowserAsync(SUPPORT_URL.trim());
    } catch (_) {
      // Nothing to do: the platform refused to open a browser.
    }
  };

  return (
    <View>
      <Text style={[styles.heading, { color: theme.textMuted }]}>SUPPORT THE PROJECT</Text>

      <View style={[styles.card, { backgroundColor: theme.bgPrimary, borderColor: theme.border }]}>
        <View style={[styles.iconBox, { backgroundColor: `${theme.accentGold}1F` }]}>
          <Ionicons name="cafe-outline" size={18} color={theme.accentGold} />
        </View>
        <View style={styles.labels}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Buy me a coffee</Text>
          <Text style={[styles.sub, { color: theme.textSecondary }]}>
            Voluntary. It keeps development going.
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[
          styles.cta,
          {
            backgroundColor: configured ? theme.accent : theme.bgTertiary,
            borderColor: configured ? theme.accent : theme.border,
          },
        ]}
        onPress={open}
        disabled={!configured}
        activeOpacity={0.8}
      >
        <Ionicons
          name="open-outline"
          size={14}
          color={configured ? theme.sendButtonIcon : theme.textMuted}
        />
        <Text
          style={[styles.ctaText, { color: configured ? theme.sendButtonIcon : theme.textMuted }]}
        >
          Open {SUPPORT_HOST}
        </Text>
      </TouchableOpacity>

      <View style={styles.noteBlock}>
        <View style={styles.noteRow}>
          <Ionicons name="information-circle-outline" size={13} color={theme.textMuted} />
          <Text style={[styles.noteText, { color: theme.textMuted }]}>
            {configured
              ? "Opens the creator page in the in-app browser. It is a tip, not a purchase — nothing in the app is locked or unlocked by it."
              : "This build has no support link set up yet."}
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
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  ctaText: { fontSize: 12.5, fontWeight: "700" },
  noteBlock: { marginTop: 10, paddingHorizontal: 2 },
  noteRow: { flexDirection: "row", alignItems: "flex-start", gap: 5 },
  noteText: { flex: 1, fontSize: 10.5, lineHeight: 14 },
});
