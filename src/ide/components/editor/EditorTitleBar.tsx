import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../../theme/themeContext";
import { getFileIcon } from "../fileExplorerUtils";

interface EditorTitleBarProps {
  theme: ThemeColors;
  fileName?: string;
  isEditing: boolean;
  isDirty?: boolean;
  errorCount?: number;
  warningCount?: number;
  onToggleSidebar?: () => void;
  onToggleEdit: () => void;
  onShowProblems?: () => void;
}

/**
 * EditorTitleBar — file identity block of the editor header.
 * Shows sidebar toggle, file icon + name, dirty dot, diagnostics badge,
 * and a clear icon-only Edit/Done toggle.
 */
export function EditorTitleBar({
  theme,
  fileName,
  isEditing,
  isDirty = false,
  errorCount = 0,
  warningCount = 0,
  onToggleSidebar,
  onToggleEdit,
  onShowProblems,
}: EditorTitleBarProps) {
  const problemCount = errorCount > 0 ? errorCount : warningCount;
  const problemColor = errorCount > 0 ? theme.accentRed : theme.accentGold;

  return (
    <View style={styles.titleBlock}>
      {onToggleSidebar && (
        <TouchableOpacity
          onPress={onToggleSidebar}
          style={styles.hamburgerBtn}
          accessibilityLabel="Toggle sidebar"
        >
          <Ionicons name="menu" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
      )}
      <View style={styles.iconWrap}>
        {fileName ? (
          getFileIcon(fileName)
        ) : (
          <Ionicons name="document-text-outline" size={16} color={theme.textMuted} />
        )}
      </View>
      <Text
        style={[styles.title, { color: fileName ? theme.textPrimary : theme.textMuted }]}
        numberOfLines={1}
        ellipsizeMode="middle"
      >
        {fileName ?? "No file open"}
      </Text>
      {isDirty && <View style={[styles.dirtyDot, { backgroundColor: theme.accentGold }]} />}
      {fileName && problemCount > 0 && (
        <TouchableOpacity
          style={[
            styles.diagBadge,
            { backgroundColor: theme.bgElevated, borderColor: problemColor },
          ]}
          onPress={onShowProblems}
          activeOpacity={0.7}
          accessibilityLabel={`Show ${problemCount} problems`}
        >
          <Ionicons
            name={errorCount > 0 ? "alert-circle" : "warning-outline"}
            size={11}
            color={problemColor}
          />
          <Text style={[styles.diagBadgeText, { color: problemColor }]}>{problemCount}</Text>
        </TouchableOpacity>
      )}
      {fileName && (
        <TouchableOpacity
          style={[
            styles.editToggle,
            { backgroundColor: theme.bgElevated, borderColor: theme.border },
            isEditing && { backgroundColor: theme.accent, borderColor: theme.accent },
          ]}
          onPress={onToggleEdit}
          activeOpacity={0.7}
          accessibilityLabel={isEditing ? "Finish editing" : "Edit file"}
        >
          <Ionicons
            name={isEditing ? "checkmark" : "pencil"}
            size={14}
            color={isEditing ? "#fff" : theme.textSecondary}
          />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  titleBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
  },
  hamburgerBtn: {
    marginRight: 2,
    padding: 4,
  },
  iconWrap: {
    marginRight: 0,
  },
  title: {
    fontSize: 13,
    fontWeight: "500",
    maxWidth: 130,
    flexShrink: 1,
  },
  dirtyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  diagBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  diagBadgeText: {
    fontSize: 10.5,
    fontWeight: "700",
  },
  editToggle: {
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
  },
});
