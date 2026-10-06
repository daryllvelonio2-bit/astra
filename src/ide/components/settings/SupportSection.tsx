import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Clipboard,
  Platform,
  ToastAndroid,
  type ImageSourcePropType,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../../theme/themeContext";
import {
  GCASH_LABEL,
  GCASH_NUMBER,
  formatGcashNumber,
  gcashClipboardValue,
  isValidGcashNumber,
} from "./gcash";

/**
 * Support the project (Settings -> Support) — GCash donations.
 *
 * GCash has NO personal payment URL. A link that opens a checkout requires
 * GCash for Business (DTI/SEC + KYC) or a gateway (PayMongo/Xendit/HitPay,
 * ~2-2.5% + ₱3, plus API keys and a server). So this screen cannot "open GCash
 * and pay": it shows the destination and the user pays from their own GCash
 * app. There is deliberately NO `gcash://` deep link — GCash's scheme handling
 * has a documented history of being abusable, and payment flows should never
 * ride a custom URL scheme.
 *
 * A donation cannot unlock anything: it tells the app nothing about who paid,
 * and "pay to unlock" would need Play Billing (app must be published on Play;
 * this one is sideloaded) or a licence server. Keep the copy honest about that.
 */

/**
 * Bundled GCash personal QR, shown above the number so senders can scan it.
 *
 * null until `assets/gcash-qr.png` exists: Metro resolves `require()` at BUILD
 * time and fails on a missing file, so this cannot point at the path
 * speculatively. To enable it, save the PNG from GCash (Receive Money → QR →
 * download) as `assets/gcash-qr.png`, then set this to
 * `require("../../../../assets/gcash-qr.png")`.
 *
 * It cannot be derived from the number here — a GCash QR is a signed QR Ph
 * payload, and a look-alike QR built from the digits would fail when scanned.
 *
 * The number stays visible on purpose: some people would rather type it than
 * scan, and it is the fallback if scanning from another screen is awkward.
 */
const GCASH_QR: ImageSourcePropType | null = null;

export function SupportSection({ theme }: { theme: ThemeColors }) {
  const [copied, setCopied] = useState(false);
  const valid = isValidGcashNumber(GCASH_NUMBER);
  const pretty = formatGcashNumber(GCASH_NUMBER);
  const hasQr = GCASH_QR !== null;
  const canDonate = hasQr || valid;

  const copy = () => {
    if (!valid) return;
    // RN core Clipboard is deprecated but still present in 0.81; the Text below
    // is selectable, so long-press-to-copy works even if this ever disappears.
    try {
      const value = gcashClipboardValue(GCASH_NUMBER);
      if (!value) return;
      Clipboard.setString(value);
      setCopied(true);
      if (Platform.OS === "android") ToastAndroid.show("GCash number copied", ToastAndroid.SHORT);
    } catch (_) {
      setCopied(false);
    }
  };

  // The steps follow whichever method is actually available.
  const steps = hasQr
    ? [
        "Open the GCash app and tap Scan QR",
        "Scan the code above — or save it and upload it from your gallery",
        "Enter any amount and confirm",
      ]
    : [
        "Open the GCash app and tap Send",
        "Choose Express Send, then paste the number",
        "Enter any amount and confirm",
      ];

  return (
    <View>
      <Text style={[styles.heading, { color: theme.textMuted }]}>SUPPORT THE PROJECT</Text>

      <View style={[styles.card, { backgroundColor: theme.bgPrimary, borderColor: theme.border }]}>
        <View style={[styles.iconBox, { backgroundColor: `${theme.accentGold}1F` }]}>
          <Ionicons name="wallet-outline" size={18} color={theme.accentGold} />
        </View>
        <View style={styles.labels}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>GCash donation</Text>
          <Text style={[styles.sub, { color: theme.textSecondary }]}>
            Optional. It keeps development going.
          </Text>
        </View>
      </View>

      {hasQr && (
        <View style={[styles.qrBox, { backgroundColor: theme.bgPrimary, borderColor: theme.border }]}>
          <Text style={[styles.numberLabel, { color: theme.textMuted }]}>SCAN OR UPLOAD THIS CODE</Text>
          <Image source={GCASH_QR as ImageSourcePropType} style={styles.qrImage} resizeMode="contain" />
          <Text style={[styles.qrHint, { color: theme.textMuted }]}>
            This is {GCASH_LABEL ? `${GCASH_LABEL}'s` : "the"} GCash code. Save the image and upload it
            from your gallery if you cannot scan from another screen.
          </Text>
        </View>
      )}

      {valid && (
        <>
          <View style={[styles.numberBox, { backgroundColor: theme.bgPrimary, borderColor: theme.border }]}>
            <Text style={[styles.numberLabel, { color: theme.textMuted }]}>
              {GCASH_LABEL ? `${GCASH_LABEL} · GCash number` : "GCash number"}
            </Text>
            {/* selectable: long-press works even without the button */}
            <Text selectable style={[styles.number, { color: theme.textPrimary }]}>
              {pretty}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.cta, { backgroundColor: theme.accent, borderColor: theme.accent }]}
            onPress={copy}
            activeOpacity={0.8}
          >
            <Ionicons name={copied ? "checkmark" : "copy-outline"} size={14} color={theme.sendButtonIcon} />
            <Text style={[styles.ctaText, { color: theme.sendButtonIcon }]}>
              {copied ? "Copied" : "Copy number"}
            </Text>
          </TouchableOpacity>
        </>
      )}

      {canDonate ? (
        <View style={styles.stepsBlock}>
          {steps.map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <Text style={[styles.stepNum, { color: theme.accent }]}>{i + 1}</Text>
              <Text style={[styles.stepText, { color: theme.textSecondary }]}>{step}</Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={[styles.numberBox, { backgroundColor: theme.bgPrimary, borderColor: theme.border }]}>
          <Text style={[styles.numberLabel, { color: theme.textMuted }]}>GCash</Text>
          <Text style={[styles.sub, { color: theme.textSecondary }]}>
            This build has no GCash details set up yet.
          </Text>
        </View>
      )}

      <View style={styles.noteBlock}>
        <View style={styles.noteRow}>
          <Ionicons name="information-circle-outline" size={13} color={theme.textMuted} />
          <Text style={[styles.noteText, { color: theme.textMuted }]}>
            GCash is a Philippine wallet, so this only works if you have it. Nothing is sent from this
            app — you send it yourself — and a donation changes nothing inside the app.
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
  sub: { fontSize: 11, lineHeight: 15 },
  qrBox: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
    gap: 8,
  },
  qrImage: { width: 190, height: 190, borderRadius: 8 },
  qrHint: { fontSize: 10.5, lineHeight: 14, textAlign: "center" },
  numberBox: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
  },
  numberLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.6 },
  number: { fontSize: 19, fontWeight: "700", letterSpacing: 1.2 },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  ctaText: { fontSize: 12.5, fontWeight: "700" },
  stepsBlock: { marginTop: 12, gap: 6, paddingHorizontal: 2 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  stepNum: { fontSize: 11, fontWeight: "700", width: 12 },
  stepText: { flex: 1, fontSize: 11.5, lineHeight: 16 },
  noteBlock: { marginTop: 12, paddingHorizontal: 2 },
  noteRow: { flexDirection: "row", alignItems: "flex-start", gap: 5 },
  noteText: { flex: 1, fontSize: 10.5, lineHeight: 14 },
});
