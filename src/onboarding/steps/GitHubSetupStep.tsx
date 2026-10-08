import React, { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../theme/themeContext";
import { GitBrowserLoginTab } from "../../ide/components/git/GitBrowserLoginTab";
import { GitHubSession } from "../../ide/services/gitService";

interface GitHubSetupStepProps {
  theme: ThemeColors;
  isLandscape?: boolean;
  onConfigured: () => void;
  onSkip: () => void;
}

export function GitHubSetupStep({
  theme,
  isLandscape = false,
  onConfigured,
  onSkip,
}: GitHubSetupStepProps) {
  const handleSessionChange = useCallback(
    (s: GitHubSession | null) => {
      if (s) onConfigured();
    },
    [onConfigured]
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerWrap}>
        <View style={styles.headerTitleRow}>
          <Text style={[styles.stepTitle, { color: theme.textPrimary }]}>
            Connect GitHub
          </Text>
          <View style={[styles.recommendedBadge, { backgroundColor: `${theme.accent}14` }]}>
            <Text style={[styles.recommendedText, { color: theme.accent }]}>Recommended</Text>
          </View>
        </View>
        <Text style={[styles.stepSubtitle, { color: theme.textSecondary }]}>
          Enable 1-tap git push, pull, and repository management. If you skip, the Git tab will be hidden until you sign in.
        </Text>
      </View>

      <View style={[styles.formCard, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
        <GitBrowserLoginTab onSessionChange={handleSessionChange} />
      </View>

      <TouchableOpacity
        style={[styles.skipOptionRow, { borderColor: theme.border }]}
        onPress={onSkip}
        activeOpacity={0.7}
      >
        <Ionicons name="information-circle-outline" size={16} color={theme.textMuted} />
        <Text style={[styles.skipOptionText, { color: theme.textMuted }]}>
          Don't have a GitHub account ready? Skip for now — the Git tab will be hidden until you sign in later.
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
  },
  headerWrap: {
    gap: 4,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  recommendedBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  recommendedText: {
    fontSize: 10.5,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  stepSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  formCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    overflow: "hidden",
  },
  skipOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  skipOptionText: {
    fontSize: 11.5,
    lineHeight: 16,
    flex: 1,
  },
});