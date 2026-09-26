import React from "react";
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { GitHubApiError } from "../../services/gitHubApi";

/**
 * The three states every GitHub screen needs — centred spinner, an honest
 * error with retry, and an empty state — plus the small shared chips used
 * across lists. Text-forward, no decorative boxes.
 */

export function LoadingState({ label }: { label?: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.center}>
      <ActivityIndicator size="small" color={theme.accent} />
      {!!label && <Text style={[styles.hint, { color: theme.textMuted }]}>{label}</Text>}
    </View>
  );
}

export function ErrorState({
  error,
  onRetry,
  compact,
}: {
  error: GitHubApiError | string | null;
  onRetry?: () => void;
  compact?: boolean;
}) {
  const { theme } = useTheme();
  const message = typeof error === "string" ? error : error?.message || "Something went wrong.";
  const rateLimited = typeof error === "object" && error?.rateLimited;
  const scopeMissing = typeof error === "object" && error?.scopeMissing;

  return (
    <View style={[styles.center, compact && styles.centerCompact]}>
      <Octicons name={rateLimited ? "clock" : scopeMissing ? "shield-lock" : "alert"} size={16} color={theme.accentRed} />
      <Text style={[styles.errorText, { color: theme.textSecondary }]}>{message}</Text>
      {onRetry && (
        <TouchableOpacity style={[styles.retryBtn, { borderColor: theme.border }]} onPress={onRetry}>
          <Text style={[styles.retryText, { color: theme.textPrimary }]}>Retry</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function EmptyState({ text, hint }: { text: string; hint?: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.center}>
      <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{text}</Text>
      {!!hint && <Text style={[styles.hint, { color: theme.textMuted }]}>{hint}</Text>}
    </View>
  );
}

/** "Type" label on every row — keeps lists scannable without extra chrome. */
export function TypePill({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <Text style={[styles.pillText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function labelColor(hex: string): string {
  const clean = (hex || "").replace("#", "");
  return /^[0-9a-f]{6}$/i.test(clean) ? `#${clean}` : "#888888";
}

export const githubStyles = StyleSheet.create({
  center: { paddingVertical: 28, alignItems: "center", gap: 9, paddingHorizontal: 22 },
  centerCompact: { paddingVertical: 14 },
  hint: { fontSize: 11, textAlign: "center" },
  errorText: { fontSize: 12, textAlign: "center", lineHeight: 17 },
  emptyText: { fontSize: 12, textAlign: "center" },
  retryBtn: { borderWidth: 1, borderRadius: 6, paddingVertical: 5, paddingHorizontal: 14 },
  retryText: { fontSize: 12, fontWeight: "700" },
  pill: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  pillText: { fontSize: 9, fontWeight: "700" },
});

export const styles = githubStyles;