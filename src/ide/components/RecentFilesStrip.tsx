import { memo } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/themeContext";
import { getFileIcon } from "./fileExplorerUtils";
import { RecentFileItem } from "./editor/useRecentFiles";

const FONT_FAMILY = Platform.OS === "ios" ? "Menlo" : "monospace";

interface RecentFilesStripProps {
  /** Pre-filtered display list (newest first, max 5, active file included). */
  files: RecentFileItem[];
  /** Matches chip key (`path || name`) of the open file for active highlight. */
  activeKey?: string;
  onSelectRecentFile?: (file: RecentFileItem) => void;
  onCloseRecentFile?: (filePath: string) => void;
}

/**
 * Compact portrait-only strip rendered directly below the editor header.
 * Shows recently opened/edited files. Landscape keeps the in-header recents
 * inside EditorTabBar, so this strip never mounts there.
 */
function RecentFilesStripInner({
  files,
  activeKey,
  onSelectRecentFile,
  onCloseRecentFile,
}: RecentFilesStripProps) {
  const { theme } = useTheme();

  if (!files || files.length === 0) return null;

  return (
    <View style={[styles.strip, { backgroundColor: theme.bgSecondary, borderBottomColor: theme.border }]}>
      <View style={styles.leadingIcon}>
        <Ionicons name="time-outline" size={12} color={theme.textMuted} />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {files.map((file) => (
          <TouchableOpacity
            key={file.path || file.name}
            style={[styles.chip, { backgroundColor: theme.bgTertiary, borderColor: theme.border }, (file.path || file.name) === activeKey && { borderColor: theme.accent }]}
            onPress={() => onSelectRecentFile?.(file)}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          >
            <View style={styles.chipIcon}>{getFileIcon(file.name)}</View>
            <Text
              style={[styles.chipText, { color: theme.textSecondary }]}
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
                style={styles.chipClose}
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
    </View>
  );
}

export const RecentFilesStrip = memo(RecentFilesStripInner);

const styles = StyleSheet.create({
  strip: {
    height: 28,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  leadingIcon: {
    justifyContent: "center",
    alignItems: "center",
    marginRight: 6,
    flexShrink: 0,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 1,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    gap: 4,
    maxWidth: 140,
  },
  chipIcon: {
    justifyContent: "center",
    alignItems: "center",
  },
  chipText: {
    fontSize: 10.5,
    fontFamily: FONT_FAMILY,
    fontWeight: "500",
    maxWidth: 84,
  },
  dirtyDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  chipClose: {
    padding: 1,
    borderRadius: 3,
    marginLeft: 2,
  },
});
