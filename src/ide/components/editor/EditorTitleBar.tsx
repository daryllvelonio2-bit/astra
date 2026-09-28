import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../../theme/themeContext";
import { getFileIcon } from "../fileExplorerUtils";

interface EditorTitleBarProps {
  theme: ThemeColors;
  fileName?: string;
  workspaceName?: string;
  isDirty?: boolean;
  errorCount?: number;
  warningCount?: number;
  onToggleSidebar?: () => void;
  onShowProblems?: () => void;
}

/**
 * EditorTitleBar — file identity block of the editor header.
 * Shows sidebar toggle, workspace name, active file identity, dirty dot,
 * and diagnostics badge.
 */
export function EditorTitleBar({
  theme,
  fileName,
  workspaceName,
  isDirty = false,
  errorCount = 0,
  warningCount = 0,
  onToggleSidebar,
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

      {workspaceName ? (
        <Text
          style={[styles.wsTitle, { color: theme.textSecondary }]}
          numberOfLines={1}
        >
          {workspaceName}
        </Text>
      ) : null}

      {workspaceName && fileName ? (
        <Text style={[styles.sep, { color: theme.textMuted }]}>/</Text>
      ) : null}

      {fileName ? (
        <>
          <View style={styles.iconWrap}>{getFileIcon(fileName)}</View>
          <Text
            style={[styles.title, { color: theme.textPrimary }]}
            numberOfLines={1}
            ellipsizeMode="middle"
          >
            {fileName}
          </Text>
        </>
      ) : !workspaceName ? (
        <>
          <View style={styles.iconWrap}>
            <Ionicons name="document-text-outline" size={16} color={theme.textMuted} />
          </View>
          <Text style={[styles.title, { color: theme.textMuted }]}>
            No file open
          </Text>
        </>
      ) : null}

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
    </View>
  );
}

const styles = StyleSheet.create({
  titleBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 1,
    minWidth: 0,
  },
  hamburgerBtn: {
    marginRight: 2,
    padding: 4,
  },
  wsTitle: {
    fontSize: 12,
    fontWeight: "700",
    maxWidth: 110,
    flexShrink: 1,
  },
  sep: {
    fontSize: 12,
    marginHorizontal: 1,
    opacity: 0.6,
  },
  iconWrap: {
    marginRight: 0,
  },
  title: {
    fontSize: 12.5,
    fontWeight: "600",
    maxWidth: 120,
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
});
