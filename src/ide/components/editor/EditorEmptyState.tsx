import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { EditorTabBar } from "../EditorTabBar";
import { ThemeColors } from "../../../theme/themeContext";

interface EditorEmptyStateProps {
  theme: ThemeColors;
  onExitProject?: () => void;
  onToggleSidebar?: () => void;
  onOpenSettings?: () => void;
}

export function EditorEmptyState({
  theme,
  onExitProject,
  onToggleSidebar,
  onOpenSettings,
}: EditorEmptyStateProps) {
  return (
    <View style={[styles.container, { backgroundColor: theme.bgPrimary }]}>
      <EditorTabBar
        isEditing={false}
        onToggleEdit={() => {}}
        onDoneEdit={() => {}}
        onExitProject={onExitProject}
        onToggleSidebar={onToggleSidebar}
        onOpenSettings={onOpenSettings}
      />
      <View style={[styles.emptyContainer, { backgroundColor: theme.bgPrimary }]}>
        <Ionicons name="code-working-outline" size={48} color={theme.textMuted} />
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
          Select a file from the explorer to begin editing
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: "relative",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
  },
});
