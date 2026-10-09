import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../../theme/themeContext";
import { SettingsOptionCard } from "./SettingsOptionCard";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_MAX_CHARS,
  FEEDBACK_MAX_REPLY_TO,
  DEFAULT_FEEDBACK_CATEGORY,
  FeedbackCategory,
  localIsoTimestamp,
  sendFeedback,
} from "./feedbackTransport";

/**
 * The feedback compose form — category + message + optional reply-to + send.
 * Split out of FeedbackSection so each stays well under the 500-line cap.
 *
 * The sender is the APP, not the user's mail client (no mailto:, no handoff):
 * the report goes straight to the relay. The developer addresses appear NOWHERE
 * here or anywhere in the app — they live behind feedbackTransport.
 */

// Module-level so a half-written report survives a tab switch (settings
// sections unmount when another tab is picked). Session-only: no disk write.
let draftCategory: FeedbackCategory = DEFAULT_FEEDBACK_CATEGORY;
let draftMessage = "";
let draftReplyTo = "";

/**
 * Client-side cooldown after a successful send. The message is already cleared
 * on success, but this stops a fast re-tap of a reply-typed-and-sent loop from
 * firing the same report repeatedly while the screen is still "warm".
 */
export const FEEDBACK_COOLDOWN_SECONDS = 5;

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  // `neutral` marks a non-failure refusal (the relay isn't configured yet):
  // a plain line in the screen's muted status style, not a red error.
  | { kind: "error"; text: string; neutral?: boolean };

/** Category row: the value plus the glyph shown in its leading tile. */
const CATEGORY_ROWS: Array<{ id: FeedbackCategory; icon: any }> = [
  { id: "Bug Report", icon: "bug-outline" },
  { id: "Feature Request", icon: "bulb-outline" },
  { id: "UI/UX Suggestion", icon: "color-wand-outline" },
  { id: "Performance Issue", icon: "speedometer-outline" },
  { id: "General Feedback", icon: "chatbubble-ellipses-outline" },
];

export function FeedbackComposeForm({
  theme,
  platform,
  appVersion,
}: {
  theme: ThemeColors;
  /** Platform line, e.g. "Android 14 (API 35) · Pixel 6". */
  platform: string;
  /** App version, e.g. "1.0.0". */
  appVersion: string;
}) {
  const [category, setCategory] = useState<FeedbackCategory>(draftCategory);
  const [message, setMessage] = useState(draftMessage);
  const [replyTo, setReplyTo] = useState(draftReplyTo);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [cooldownLeft, setCooldownLeft] = useState(0);
  // Synchronous in-flight lock: a state-only guard can be passed twice within
  // one frame (both taps read canSend before the re-render disables the button).
  const sendingRef = useRef(false);

  // Count the cooldown down one step per second (a single chained timeout,
  // cleaned up on unmount) and re-enable Send the moment it reaches zero.
  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const id = setTimeout(() => setCooldownLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(id);
  }, [cooldownLeft]);

  const sending = status.kind === "sending";
  const canSend = useMemo(
    () => !sending && cooldownLeft === 0 && message.trim().length > 0,
    [sending, cooldownLeft, message]
  );

  const onPickCategory = useCallback((next: FeedbackCategory) => {
    draftCategory = next;
    setCategory(next);
    setStatus((prev) => (prev.kind === "sent" || prev.kind === "error" ? { kind: "idle" } : prev));
  }, []);

  const onChangeMessage = useCallback((t: string) => {
    draftMessage = t;
    setMessage(t);
    setStatus((prev) => (prev.kind === "sent" || prev.kind === "error" ? { kind: "idle" } : prev));
  }, []);

  const onChangeReplyTo = useCallback((t: string) => {
    draftReplyTo = t;
    setReplyTo(t);
  }, []);

  const handleSend = useCallback(async () => {
    if (sendingRef.current || !canSend) return;
    sendingRef.current = true;
    setStatus({ kind: "sending" });
    const result = await sendFeedback({
      category,
      message,
      replyTo,
      platform,
      appVersion,
      submittedAt: localIsoTimestamp(),
    });
    sendingRef.current = false;
    if (result.ok) {
      // Clear the draft only once the relay has accepted it.
      draftMessage = "";
      setMessage("");
      setStatus({ kind: "sent" });
      setCooldownLeft(FEEDBACK_COOLDOWN_SECONDS);
    } else {
      // The draft is left intact, so a failure never loses the message.
      setStatus({
        kind: "error",
        text: result.error || "Couldn't send the report.",
        neutral: result.reason === "unconfigured",
      });
    }
  }, [canSend, category, message, replyTo, platform, appVersion]);

  const buttonIcon = canSend ? theme.sendButtonIcon : theme.textMuted;

  return (
    <View>
      <Text style={[styles.groupLabel, { color: theme.textMuted }]}>CATEGORY</Text>
      <View style={styles.stack}>
        {CATEGORY_ROWS.map((row) => {
          const isSelected = category === row.id;
          return (
            <SettingsOptionCard
              key={row.id}
              theme={theme}
              icon={row.icon}
              title={row.id}
              control={isSelected ? "check" : "radio"}
              selected={isSelected}
              onPress={() => onPickCategory(row.id)}
              disabled={sending}
            />
          );
        })}
      </View>

      <Text style={[styles.groupLabel, { color: theme.textMuted }]}>MESSAGE</Text>
      <View style={[styles.card, { backgroundColor: theme.bgPrimary, borderColor: theme.border }]}>
        <TextInput
          style={[styles.messageInput, { backgroundColor: theme.bgInput, borderColor: theme.border, color: theme.textPrimary }]}
          value={message}
          onChangeText={onChangeMessage}
          placeholder="What should we improve? Bugs, missing features, anything that felt slow or confusing."
          placeholderTextColor={theme.textMuted}
          multiline
          textAlignVertical="top"
          maxLength={FEEDBACK_MAX_CHARS}
          editable={!sending}
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
          maxLength={FEEDBACK_MAX_REPLY_TO}
          editable={!sending}
        />
      </View>

      <View style={styles.metaBlock}>
        <View style={styles.metaRow}>
          <Ionicons name="paper-plane-outline" size={13} color={theme.textMuted} />
          <Text style={[styles.metaText, { color: theme.textMuted }]}>
            Sent from the app straight to the Astra team. No mail app needed.
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Ionicons name="information-circle-outline" size={13} color={theme.textMuted} />
          <Text style={[styles.metaText, { color: theme.textMuted }]}>
            Attached: Astra {appVersion}
            {platform ? ` · ${platform}` : ""} · {category} · time & version
          </Text>
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
        {sending ? (
          <ActivityIndicator size="small" color={theme.textMuted} />
        ) : (
          <Ionicons name={status.kind === "sent" ? "checkmark" : "send"} size={14} color={buttonIcon} />
        )}
        <Text style={[styles.sendText, { color: buttonIcon }]}>
          {sending ? "Sending…" : status.kind === "sent" ? "Sent" : "Send feedback"}
        </Text>
      </TouchableOpacity>

      {status.kind === "error" ? (
        <Text style={[styles.status, { color: status.neutral ? theme.textMuted : theme.accentRed }]}>
          {status.text}
        </Text>
      ) : status.kind === "sent" ? (
        <Text style={[styles.status, { color: theme.accentGreen }]}>
          {cooldownLeft > 0
            ? `Thanks — that reached us. You can send another in ${cooldownLeft}s.`
            : "Thanks — that reached us. We read every report."}
        </Text>
      ) : (
        <Text style={[styles.status, { color: theme.textMuted }]}>
          Only your category, message and the details above are sent.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  groupLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.6, marginTop: 10, marginBottom: 6, paddingHorizontal: 2 },
  stack: { gap: 8 },
  card: { borderRadius: 12, borderWidth: 1, padding: 10, gap: 8 },
  messageInput: {
    minHeight: 120,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    lineHeight: 17,
  },
  replyInput: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
  },
  metaBlock: { gap: 3, marginTop: 8, paddingHorizontal: 2 },
  metaRow: { flexDirection: "row", alignItems: "flex-start", gap: 5 },
  metaText: { fontSize: 10, lineHeight: 14, flex: 1 },
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
  sendText: { fontSize: 12, fontWeight: "700" },
  status: { fontSize: 10, lineHeight: 14, marginTop: 8, paddingHorizontal: 2 },
});
