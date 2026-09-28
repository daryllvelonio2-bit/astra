import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../../theme/themeContext";
import {
  AppConfig,
  NotificationChannel,
  NotificationRouting,
  loadConfig,
  normalizeNotificationRouting,
  saveConfig,
} from "../../services/configService";
import {
  areNotificationsEnabled,
  requestNotificationPermission,
} from "../../../../modules/linux-runner/src";
import { notify } from "../../services/notificationService";

/**
 * Per-source notification routing (banner / system bar / off). Self-contained:
 * reads and writes config directly, like EnvironmentSection, so SettingsModal
 * and GeneralSection stay prop-free for this feature.
 */

const ROWS: Array<{
  key: keyof NotificationRouting;
  title: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { key: "github", title: "GitHub", hint: "New inbox notifications", icon: "logo-github" },
  { key: "terminal", title: "Terminal runs", hint: "When a Run finishes", icon: "terminal-outline" },
  { key: "agent", title: "Agent tasks", hint: "When an agent completes", icon: "sparkles-outline" },
  { key: "app", title: "App alerts", hint: "Toasts from other features", icon: "notifications-outline" },
];

const CHOICES: Array<{ id: NotificationChannel; label: string }> = [
  { id: "banner", label: "Banner" },
  { id: "system", label: "System" },
  { id: "off", label: "Off" },
];

export function NotificationsSection({ theme }: { theme: ThemeColors }) {
  const [routing, setRouting] = useState<NotificationRouting | null>(null);

  useEffect(() => {
    let mounted = true;
    void loadConfig()
      .then((cfg: AppConfig) => {
        if (mounted) setRouting(normalizeNotificationRouting(cfg.notifications));
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  if (!routing) return null;

  const pick = (key: keyof NotificationRouting, value: NotificationChannel) => {
    const next = { ...routing, [key]: value };
    setRouting(next);
    void saveConfig({ notifications: next });
    // Android 13+ needs a runtime grant for the status-bar channel; ask for
    // it the moment the user opts in. Denied → notifications fall back to the
    // banner automatically (notificationService).
    if (value === "system" && !areNotificationsEnabled()) {
      requestNotificationPermission();
    }
  };

  return (
    <View>
      <Text style={[styles.heading, { color: theme.textMuted }]}>NOTIFICATIONS</Text>
      <View style={[styles.card, { backgroundColor: theme.bgPrimary, borderColor: theme.border }]}>
        {ROWS.map((row, idx) => (
          <View
            key={row.key}
            style={[
              styles.row,
              idx > 0 && { borderTopWidth: 1, borderTopColor: theme.border },
            ]}
          >
            <View style={[styles.iconBox, { backgroundColor: `${theme.accent}18` }]}>
              <Ionicons name={row.icon} size={15} color={theme.accent} />
            </View>
            <View style={styles.labels}>
              <Text style={[styles.title, { color: theme.textPrimary }]}>{row.title}</Text>
              <Text style={[styles.hint, { color: theme.textMuted }]}>{row.hint}</Text>
            </View>
            <View style={styles.choices}>
              {CHOICES.map((c) => {
                const active = routing[row.key] === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => pick(row.key, c.id)}
                    activeOpacity={0.7}
                    style={[
                      styles.choice,
                      {
                        backgroundColor: active ? theme.accent : theme.bgTertiary,
                        borderColor: active ? theme.accent : theme.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.choiceText,
                        { color: active ? theme.sendButtonIcon : theme.textSecondary },
                      ]}
                    >
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </View>
      <TouchableOpacity
        style={[
          styles.testBtn,
          { backgroundColor: `${theme.accent}18`, borderColor: `${theme.accent}40` },
        ]}
        onPress={() =>
          notify({
            source: "app",
            tone: "info",
            title: "Test notification",
            message: "Global banner — appears on every screen for 8 seconds.",
            channel: "banner",
          })
        }
        activeOpacity={0.7}
      >
        <Ionicons name="notifications-outline" size={14} color={theme.accent} />
        <Text style={[styles.testText, { color: theme.accent }]}>Send test banner</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8, marginTop: 6, marginBottom: 2 },
  card: { borderRadius: 10, borderWidth: 1, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, gap: 10 },
  iconBox: { width: 28, height: 28, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  labels: { flex: 1, gap: 1 },
  title: { fontSize: 13, fontWeight: "600" },
  hint: { fontSize: 10.5 },
  choices: { flexDirection: "row", gap: 4 },
  choice: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, borderWidth: 1 },
  choiceText: { fontSize: 10.5, fontWeight: "700" },
  testBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 8,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  testText: { fontSize: 11.5, fontWeight: "600" },
});