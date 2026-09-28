import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";

interface WebBrowserErrorViewProps {
  url: string;
  errorMessage: string;
  onNavigate: (targetUrl: string) => void;
  onReload: () => void;
  onOpenExternal: () => void;
}

export function WebBrowserErrorView({
  url,
  errorMessage,
  onNavigate,
  onReload,
  onOpenExternal,
}: WebBrowserErrorViewProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.errorContainer, { backgroundColor: theme.bgPrimary }]}>
      <Ionicons name="cloud-offline-outline" size={48} color={theme.accentRed} />
      <Text style={[styles.errorTitle, { color: theme.textPrimary }]}>Cannot Connect to Server</Text>
      <Text style={[styles.errorSubtext, { color: theme.textSecondary }]}>
        {errorMessage || `No server responded on ${url}`}
      </Text>

      {/* Suggestion Commands */}
      <View style={[styles.suggestionCard, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
        <Text style={[styles.suggestionTitle, { color: theme.textSecondary }]}>💡 Start the server in the terminal:</Text>
        <Text style={[styles.suggestionCode, { color: theme.accent }]}>$ npm run dev</Text>
        <Text style={[styles.suggestionCode, { color: theme.accent }]}>$ npx expo start --web</Text>
        <Text style={[styles.suggestionCode, { color: theme.accent }]}>$ python3 -m http.server</Text>
      </View>

      {/* Actions */}
      <View style={styles.errorActions}>
        <TouchableOpacity style={[styles.retryBtn, { backgroundColor: theme.accent }]} onPress={onReload} activeOpacity={0.8}>
          <Ionicons name="refresh" size={14} color={theme.sendButtonIcon} style={{ marginRight: 4 }} />
          <Text style={[styles.retryBtnText, { color: theme.sendButtonIcon }]}>Retry</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.externalLinkBtn, { backgroundColor: theme.bgTertiary, borderColor: theme.border }]} onPress={onOpenExternal} activeOpacity={0.8}>
          <Ionicons name="open-outline" size={14} color={theme.textPrimary} style={{ marginRight: 4 }} />
          <Text style={[styles.externalLinkText, { color: theme.textPrimary }]}>Open Externally</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginTop: 14,
  },
  errorSubtext: {
    fontSize: 12.5,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 16,
    maxWidth: 320,
    fontFamily: "monospace",
  },
  suggestionCard: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    marginBottom: 18,
  },
  suggestionTitle: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
  },
  suggestionCode: {
    fontSize: 11.5,
    fontFamily: "monospace",
    marginVertical: 2,
  },
  errorActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  retryBtnText: {
    fontSize: 12.5,
    fontWeight: "600",
  },
  externalLinkBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  externalLinkText: {
    fontSize: 12.5,
    fontWeight: "600",
  },
});
