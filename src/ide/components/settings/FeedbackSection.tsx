import React, { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Platform, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { ThemeColors } from "../../../theme/themeContext";
import { loadWorkspaceRegistry } from "../../services/workspaceService";
import {
  FEEDBACK_MAX_CHARS,
  FEEDBACK_MAX_REPLY_TO,
  isFeedbackConfigured,
  sendFeedback,
} from "./feedbackTransport";

/**
 * Send feedback to the developers (Settings -> Feedback).
 *
 * Two deliberate properties:
 *  - The sender is the APP, not the user's mail client. No mail-app handoff
 *    URL, so a user with no mail app configured can still report something, and
 *    report is one tap instead of "compose it yourself and remember to send".
 *  - The developer addresses appear NOWHERE here. They live behind the relay
 *    (feedbackTransport.FEEDBACK_ENDPOINT), so they cannot be read out of the
 *    APK. Do not add them back into any string in this file.
 */

// Module-level so a half-written report survives a tab switch (the sections
// unmount when another tab is picked). Session-only: no disk, no config write.
let draftMessage = "";
let draftReplyTo = "";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "error"; text: string };

/** "Android 14 (API 35)" on device; a plain label elsewhere (dev/harness). */
function osVersionLabel(): string {
  if (Platform.OS === "android") {
    const c = (Platform.constants ?? {}) as { Release?: string };
    return c.Release
      ? `Android ${c.Release} (API ${String(Platform.Version)})`
      : `Android API ${String(Platform.Version)}`;
  }
  return `${Platform.OS} ${String(Platform.Version)}`;
}

/** Hardware model, e.g. "Pixel 6" — straight from the runtime, no new deps. */
function deviceModelLabel(): string {
  const c = (Platform.constants ?? {}) as { Model?: string; Brand?: string };
  const model = (c.Model || "").trim();
  const brand = (c.Brand || "").trim();
  if (!model) return brand || "unknown device";
  if (brand && !model.toLowerCase().startsWith(brand.toLowerCase())) return `${brand} ${model}`;
  return model;
}

/** The exact environment line attached to every report. */
function buildDiagnostics(workspaceName: string): string {
  const version = (Constants.expoConfig as { version?: string } | null)?.version || "?";
  const parts = [`Astra ${version}`, osVersionLabel(), deviceModelLabel()];
  if (workspaceName) parts.push(`workspace ${workspaceName}`);
  return parts.join(" · ");
}

export function FeedbackSection({ theme, workspaceId }: { theme: ThemeColors; workspaceId?: string }) {
  const [message, setMessage] = useState(draftMessage);
  const [replyTo, setReplyTo] = useState(draftReplyTo);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [workspaceName, setWorkspaceName] = useState("");

  // Resolve the id to the human name once, so the report says which project.
  useEffect(() => {
    let alive = true;
    if (!workspaceId) {
      setWorkspaceName("");
      return;
    }
    loadWorkspaceRegistry()
      .then((reg) => {
        if (alive) setWorkspaceName(reg[workspaceId]?.name || workspaceId);
      })
      .catch(() => {
        if (alive) setWorkspaceName(workspaceId);
      });
    return () => {
      alive = false;
    };
  }, [workspaceId]);

  const configured = isFeedbackConfigured();
  const diagnostics = buildDiagnostics(workspaceName);
  const sending = status.kind === "sending";
  const canSend = configured && !sending && message.trim().length > 0;

  const onChangeMessage = (t: string) => {
    draftMessage = t;
    setMessage(t);
    if (status.kind === "sent" || status.kind === "error") setStatus({ kind: "idle" });
  };

  const onChangeReplyTo = (t: string) => {
    draftReplyTo = t;
    setReplyTo(t);
  };

  const handleSend = async () => {
    // The guard plus the disabled button: a double-tap cannot send twice.
    if (!canSend) return;
    setStatus({ kind: "sending" });
    const result = await sendFeedback({ message, replyTo, diagnostics });
    if (result.ok) {
      // Clear the draft only once the relay has accepted it.
      draftMessage = "";
      setMessage("");
      setStatus({ kind: "sent" });
    } else {
      setStatus({ kind: "error", text: result.error || "Couldn't send the report." });
    }
  };

  const buttonIcon = canSend ? theme.sendButtonIcon : theme.textMuted;

  return (
    <View>
      <Text style={[styles.heading, { color: theme.textMuted }]}>SEND FEEDBACK</Text>

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
        {sending ? (
          <ActivityIndicator size="small" color={theme.textMuted} />
        ) : (
          <Ionicons name={status.kind === "sent" ? "checkmark" : "send"} size={14} color={buttonIcon} />
        )}
        <Text style={[styles.sendText, { color: buttonIcon }]}>
          {sending ? "Sending…" : status.kind === "sent" ? "Sent" : "Send feedback"}
        </Text>
      </TouchableOpacity>

      {status.kind === "error" && (
        <Text style={[styles.status, { color: theme.accentRed }]}>{status.text}</Text>
      )}
      {status.kind === "error" ? null : status.kind === "sent" ? (
        <Text style={[styles.status, { color: theme.accentGreen }]}>
          Thanks — that reached us. We read every report.
        </Text>
      ) : (
        <Text style={[styles.status, { color: theme.textMuted }]}>
          {configured
            ? "Only your message and the line above are sent."
            : "The feedback relay isn't configured in this build yet, so sending is disabled."}
        </Text>
      )}
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
  status: { fontSize: 10.5, lineHeight: 14, marginTop: 8, paddingHorizontal: 2 },
});
