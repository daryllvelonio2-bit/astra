import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { EditorTabBar } from "../EditorTabBar";
import { ThemeColors } from "../../../theme/themeContext";

interface EditorEmptyStateProps {
  theme: ThemeColors;
  workspaceName?: string;
  onExitProject?: () => void;
  onToggleSidebar?: () => void;
  onOpenSettings?: () => void;
  onOpenSearch?: () => void;
  onImport?: () => void;
  onExport?: () => void;
  sidebar?: React.ReactNode;
  isSidebarOpen?: boolean;
  edgePanHandlers?: any;
}

export function EditorEmptyState({
  theme,
  workspaceName,
  onExitProject,
  onToggleSidebar,
  onOpenSettings,
  onOpenSearch,
  onImport,
  onExport,
  sidebar,
  isSidebarOpen,
  edgePanHandlers,
}: EditorEmptyStateProps) {
  return (
    <View style={[styles.container, { backgroundColor: theme.bgPrimary }]}>
      <EditorTabBar
        workspaceName={workspaceName}
        isEditing={false}
        onToggleEdit={() => {}}
        onDoneEdit={() => {}}
        onExitProject={onExitProject}
        onToggleSidebar={onToggleSidebar}
        onOpenSettings={onOpenSettings}
        onOpenSearch={onOpenSearch}
        onImport={onImport}
        onExport={onExport}
      />
      <View style={styles.contentRow}>
        {sidebar}
        <View
          style={[styles.emptyContainer, { backgroundColor: theme.bgPrimary }]}
          {...(!isSidebarOpen && edgePanHandlers ? edgePanHandlers : {})}
        >
          <Ionicons name="code-working-outline" size={48} color={theme.textMuted} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Select a file from the explorer to begin editing
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: "relative",
  },
  contentRow: {
    flex: 1,
    flexDirection: "row",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    position: "relative",
  },
  emptyText: {
    fontSize: 14,
  },
});
