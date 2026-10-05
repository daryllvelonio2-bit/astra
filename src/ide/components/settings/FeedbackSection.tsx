import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Linking, Platform, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { ThemeColors } from "../../../theme/themeContext";
import { showAppDialog } from "../../services/appDialog";
import {
  FEEDBACK_RECIPIENTS,
  buildFeedbackMailto,
  buildFeedbackPlainText,
} from "./feedbackMail";

/**
 * Send feedback to the developers (Settings -> Feedback).
 *
 * Delivery is a `mailto:` handoff — the report is composed here and handed to
 * whatever mail app the device has, with both developer addresses already in
 * the To: line. Deliberately NOT a hosted endpoint: that needs a server we do
 * not own (or a form relay that has to be activated from each inbox first),
 * and any mail-API key shipped inside the APK would let anyone send mail as
 * us. Nothing is transmitted by tapping Send; the user sees the mail app and
 * presses send there, so they can read exactly what leaves the device.
 */

// Module-level so a half-written report survives a tab switch (the sections
// unmount when another tab is picked). Session-only: no disk, no config write.
let draftMessage = "";
let draftReplyTo = "";

function diagnosticsLine(): string {
  const version = (Constants.expoConfig as { version?: string } | null)?.version || "?";
  return `Astra ${version} · ${Platform.OS} API ${String(Platform.Version)}`;
}

export function FeedbackSection({ theme }: { theme: ThemeColors }) {
  const [message, setMessage] = useState(draftMessage);
  const [replyTo, setReplyTo] = useState(draftReplyTo);
  const [handedOff, setHandedOff] = useState(false);

  const diagnostics = diagnosticsLine();
  const canSend = message.trim().length > 0;

  const onChangeMessage = (t: string) => {
    draftMessage = t;
    setMessage(t);
    setHandedOff(false);
  };

  const onChangeReplyTo = (t: string) => {
    draftReplyTo = t;
    setReplyTo(t);
  };

  const showNoMailAppDialog = () => {
    showAppDialog({
      title: "No mail app found",
      message:
        `This device has no app that can send email. Please write to us directly at:\n\n` +
        `${FEEDBACK_RECIPIENTS.join("\n")}\n\nYour report is copied below.\n\n` +
        buildFeedbackPlainText({ message, replyTo, diagnostics }),
      buttons: [{ text: "OK", style: "cancel" }],
    });
  };

  const handleSend = async () => {
    if (!canSend) return;
    const url = buildFeedbackMailto({ message, replyTo, diagnostics });
    try {
      await Linking.openURL(url);
      setHandedOff(true);
    } catch (_) {
      try {
        // Some handlers reject the long query form but accept the plain one.
        await Linking.openURL(url.split("?")[0]);
        setHandedOff(true);
      } catch (_2) {
        showNoMailAppDialog();
      }
    }
  };

  return (
    <View>
      <Text style={[styles.heading, { color: theme.textMuted }]}>SEND FEEDBACK</Text>

      <View style={[styles.card, { backgroundColor: theme.bgPrimary, borderColor: theme.border }]}>
        <TextInput
          style={[styles.messageInput, { backgroundColor: theme.bgInput, borderColor: theme.border, color: theme.textPrimary }]}
          value={message}
          onChangeText={onChangeMessage}
          placeholder="What should we improve? Bugs, missing features, anything that felt slow or confusing…"
          placeholderTextColor={theme.textMuted}
          multiline
          textAlignVertical="top"
          maxLength={4000}
        />
        <TextInput
          style={[styles.replyInput, { backgroundColor: theme.bgInput, borderColor: theme.border, color: theme.textPrimary }]}
          value={replyTo}
          onChangeText={onChangeReplyTo}
          placeholder="Your email, if you want a reply (optional)"
          placeholderTextColor={theme.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          maxLength={120}
        />
      </View>

      <View style={styles.metaBlock}>
        <View style={styles.metaRow}>
          <Ionicons name="at-outline" size={13} color={theme.textMuted} />
          <Text style={[styles.metaText, { color: theme.textMuted }]}>
            Goes to {FEEDBACK_RECIPIENTS.join(", ")}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Ionicons name="information-circle-outline" size={13} color={theme.textMuted} />
          <Text style={[styles.metaText, { color: theme.textMuted }]}>Attached: {diagnostics}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[
          styles.sendBtn,
          {
            backgroundColor: canSend ? theme.accent : theme.bgTertiary,
            borderColor: canSend ? theme.accent : theme.border,
          },
        ]}
        onPress={handleSend}
        disabled={!canSend}
        activeOpacity={0.8}
      >
        <Ionicons
          name="send"
          size={14}
          color={canSend ? theme.sendButtonIcon : theme.textMuted}
        />
        <Text
          style={[styles.sendText, { color: canSend ? theme.sendButtonIcon : theme.textMuted }]}
        >
          Send feedback
        </Text>
      </TouchableOpacity>

      <Text style={[styles.hint, { color: theme.textMuted }]}>
        {handedOff
          ? "Handed to your mail app — press Send there to deliver it."
          : "Opens your mail app with the message ready. Nothing is sent until you press Send there."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8, marginTop: 6, marginBottom: 6 },
  card: { borderRadius: 10, borderWidth: 1, padding: 10, gap: 8 },
  messageInput: {
    minHeight: 120,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12.5,
    lineHeight: 18,
  },
  replyInput: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12.5,
  },
  metaBlock: { gap: 3, marginTop: 8, paddingHorizontal: 2 },
  metaRow: { flexDirection: "row", alignItems: "flex-start", gap: 5 },
  metaText: { fontSize: 10.5, lineHeight: 14, flex: 1 },
  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  sendText: { fontSize: 12.5, fontWeight: "700" },
  hint: { fontSize: 10.5, lineHeight: 14, marginTop: 8, paddingHorizontal: 2 },
});
