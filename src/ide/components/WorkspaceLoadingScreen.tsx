import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { useTheme } from "../../theme/themeContext";

interface WorkspaceLoadingScreenProps {
  statusText?: string;
  isError?: boolean;
  onBack?: () => void;
  onRetry?: () => void;
  timeoutMs?: number;
}

/**
 * Workspace loading gate. Never traps the user: Back is always available,
 * and past `timeoutMs` a Retry appears. The live `statusText` (folder count
 * + current path) pinpoints exactly where a slow/hung scan sticks.
 */
export function WorkspaceLoadingScreen({
  statusText,
  isError,
  onBack,
  onRetry,
  timeoutMs = 20000,
}: WorkspaceLoadingScreenProps) {
  const { theme } = useTheme();
  const [timedOut, setTimedOut] = useState(false);

  // Parent remounts this screen per load attempt (key=loadSeq), so the
  // timer naturally restarts on every retry.
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), timeoutMs);
    return () => clearTimeout(t);
  }, [timeoutMs]);

  return (
    <View style={[styles.container, { backgroundColor: theme.bgPrimary }]}>
      <ActivityIndicator size="large" color={theme.accent} style={{ marginBottom: 12 }} />
      <Text style={[styles.title, { color: theme.textSecondary }]}>Opening Workspace...</Text>
      {!!statusText && (
        <Text style={[styles.status, { color: isError ? theme.accentRed : theme.textMuted }]} numberOfLines={3}>
          {statusText}
        </Text>
      )}
      {timedOut && (
        <Text style={[styles.status, { color: theme.accentGold }]}>
          Taking longer than usual — the project may be very large or busy.
        </Text>
      )}
      <View style={styles.actions}>
        {onBack && (
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: theme.bgTertiary, borderColor: theme.border }]}
            onPress={onBack}
          >
            <Text style={[styles.btnText, { color: theme.textPrimary }]}>‹ Back</Text>
          </TouchableOpacity>
        )}
        {(timedOut || isError) && onRetry && (
          <TouchableOpacity style={[styles.btn, { backgroundColor: theme.accent }]} onPress={onRetry}>
            <Text style={[styles.btnText, { color: theme.sendButtonIcon }]}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 15,
  },
  status: {
    fontSize: 12,
    marginTop: 8,
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  btn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  btnText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
