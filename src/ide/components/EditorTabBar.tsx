import React, { useState, useEffect, useMemo } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/themeContext";
import { getFileIcon } from "./fileExplorerUtils";
import { RecentFilesStrip } from "./RecentFilesStrip";
import { subscribeIconTheme } from "../services/extensions/iconThemeService";
import { RecentFileItem } from "./editor/useRecentFiles";
import { EditorTitleBar } from "./editor/EditorTitleBar";
import { EditorActionMenu, EditorMenuAction } from "./editor/EditorActionMenu";

interface EditorTabBarProps {
  fileName?: string;
  activeFilePath?: string;
  isEditing: boolean;
  onToggleEdit: () => void;
  onDoneEdit?: () => void;
  onRunFile?: () => void;
  onExitProject?: () => void;
  onToggleSidebar?: () => void;
  errorCount?: number;
  warningCount?: number;
  onShowProblems?: () => void;
  onOpenSettings?: () => void;
  onFormat?: () => void;
  isFormatting?: boolean;
  isLandscape?: boolean;
  isSplitScreen?: boolean;
  onToggleSplitScreen?: () => void;
  recentFiles?: RecentFileItem[];
  onSelectRecentFile?: (file: RecentFileItem) => void;
  onCloseRecentFile?: (filePath: string) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
  /** Unsaved-changes indicator for the title bar dirty dot. */
  isDirty?: boolean;
}

function EditorTabBarInner({
  fileName,
  activeFilePath,
  isEditing,
  onToggleEdit,
  onDoneEdit: _onDoneEdit,
  onRunFile,
  onExitProject,
  onToggleSidebar,
  errorCount = 0,
  warningCount = 0,
  onShowProblems,
  onOpenSettings,
  onFormat,
  isFormatting = false,
  isLandscape = false,
  isSplitScreen = false,
  onToggleSplitScreen,
  recentFiles = [],
  onSelectRecentFile,
  onCloseRecentFile,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  isDirty = false,
}: EditorTabBarProps) {
  const { theme } = useTheme();
  const [menuVisible, setMenuVisible] = useState(false);

  // 5 most recent files, active file included — opening a file must not
  // remove it from the list. Newest first (hook prepends on open/edit).
  const recentFilesToDisplay = useMemo(() => {
    if (!recentFiles || recentFiles.length === 0) return [];
    return recentFiles.slice(0, 5);
  }, [recentFiles]);
  const activeKey = activeFilePath || fileName;

  const [, setIconTick] = useState(0);
  useEffect(() => {
    return subscribeIconTheme(() => {
      setIconTick((t) => t + 1);
    });
  }, []);

  // Overflow sheet actions: everything beyond the 3 inline slots
  // (Edit toggle, Run, ⋯). Format / split / zoom controls are removed
  // from the sheet — those features are working and stay reachable via
  // their own surfaces (handlers still wired, just no menu buttons).
  const menuActions: EditorMenuAction[] = useMemo(() => {
    const items: EditorMenuAction[] = [];
    if (onOpenSettings) {
      items.push({ key: "settings", label: "Settings", icon: "settings-outline", run: onOpenSettings });
    }
    if (onExitProject) {
      items.push({ key: "exit", label: "Exit Project", icon: "exit-outline", destructive: true, run: onExitProject });
    }
    return items;
  }, [onOpenSettings, onExitProject]);

  return (
    <>
      <View style={[styles.tabBar, { backgroundColor: theme.bgSecondary, borderBottomColor: theme.border }]}>
        <EditorTitleBar
          theme={theme}
          fileName={fileName}
          isEditing={isEditing}
          isDirty={isDirty}
          errorCount={errorCount}
          warningCount={warningCount}
          onToggleSidebar={onToggleSidebar}
          onToggleEdit={onToggleEdit}
          onShowProblems={onShowProblems}
        />

        {/* Recently Edited Files live in the header on landscape only —
            portrait renders them in the compact strip below the header. */}
        {isLandscape && recentFilesToDisplay.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.recentFilesScroll}
            contentContainerStyle={styles.recentFilesContent}
            keyboardShouldPersistTaps="handled"
          >
            {recentFilesToDisplay.map((file) => (
              <TouchableOpacity
                key={file.path || file.name}
                style={[
                  styles.recentChip,
                  { backgroundColor: theme.bgTertiary, borderColor: theme.border },
                  (file.path || file.name) === activeKey && { borderColor: theme.accent },
                ]}
                onPress={() => onSelectRecentFile?.(file)}
                activeOpacity={0.7}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              >
                <View style={styles.recentChipIcon}>{getFileIcon(file.name)}</View>
                <Text
                  style={[styles.recentChipText, { color: theme.textSecondary }]}
                  numberOfLines={1}
                  ellipsizeMode="middle"
                >
                  {file.name}
                </Text>
                {file.lastEdited ? (
                  <View style={[styles.dirtyDot, { backgroundColor: theme.accentGreen }]} />
                ) : null}
                {onCloseRecentFile && (
                  <TouchableOpacity
                    style={styles.recentChipClose}
                    onPress={(e) => {
                      e.stopPropagation();
                      onCloseRecentFile(file.path);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  >
                    <Ionicons name="close" size={10} color={theme.textMuted} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Inline actions: max 3 slots — Run + split toggle + overflow.
            The Edit/Done toggle lives in the title bar. */}
        <View style={styles.tabActions}>
          {fileName && onRunFile && (
            <TouchableOpacity
              style={styles.actionIconBtn}
              onPress={onRunFile}
              accessibilityLabel="Run file"
            >
              <Ionicons name="play" size={16} color={theme.accentGreen} />
            </TouchableOpacity>
          )}
          {fileName && isLandscape && onToggleSplitScreen && (
            <TouchableOpacity
              style={[
                styles.actionIconBtn,
                isSplitScreen && { backgroundColor: `${theme.accent}25`, borderRadius: 6 },
              ]}
              onPress={onToggleSplitScreen}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityLabel="Toggle split view"
            >
              <Ionicons
                name={isSplitScreen ? "tablet-portrait-outline" : "tablet-landscape-outline"}
                size={16}
                color={isSplitScreen ? theme.accent : theme.textSecondary}
              />
            </TouchableOpacity>
          )}
          <EditorActionMenu
            theme={theme}
            visible={menuVisible}
            onClose={() => setMenuVisible(false)}
            onOpen={() => setMenuVisible(true)}
            actions={menuActions}
          />
        </View>
      </View>

      {/* Portrait only: compact recents strip directly below the header. */}
      {!isLandscape && (
        <RecentFilesStrip
          files={recentFilesToDisplay}
          activeKey={activeKey}
          onSelectRecentFile={onSelectRecentFile}
          onCloseRecentFile={onCloseRecentFile}
        />
      )}
    </>
  );
}

export const EditorTabBar = React.memo(EditorTabBarInner);

const styles = StyleSheet.create({
  tabBar: {
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    zIndex: 10,
  },
  recentFilesScroll: {
    flex: 1,
    marginHorizontal: 8,
    maxHeight: 28,
  },
  recentFilesContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 1,
  },
  recentChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    gap: 5,
    maxWidth: 150,
  },
  recentChipIcon: {
    justifyContent: "center",
    alignItems: "center",
  },
  recentChipText: {
    fontSize: 11,
    fontFamily: "monospace",
    fontWeight: "500",
    maxWidth: 90,
  },
  dirtyDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  recentChipClose: {
    padding: 1,
    borderRadius: 3,
    marginLeft: 2,
  },
  tabActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  actionIconBtn: {
    padding: 6,
    borderRadius: 4,
  },
});
