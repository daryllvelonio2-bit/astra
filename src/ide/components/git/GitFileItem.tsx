import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { GitFileStatus } from "./types";

interface GitFileItemProps {
  file: GitFileStatus;
  isSelected: boolean;
  isLandscape: boolean;
  onSelectFile: (file: GitFileStatus) => void;
  onToggleStageFile: (file: GitFileStatus) => void;
}

export const GitFileItem = React.memo(function GitFileItem({
  file,
  isSelected,
  isLandscape,
  onSelectFile,
  onToggleStageFile,
}: GitFileItemProps) {
  const { theme } = useTheme();

  const getStatusDetails = (status: GitFileStatus["status"]) => {
    switch (status) {
      case "modified":
        return { text: "Modified", color: theme.accentGold, bg: `${theme.accentGold}18` };
      case "added":
        return { text: "New", color: theme.accentGreen, bg: `${theme.accentGreen}18` };
      case "untracked":
        return { text: "New", color: theme.accentGreen, bg: `${theme.accentGreen}18` };
      case "deleted":
        return { text: "Deleted", color: theme.accentRed, bg: `${theme.accentRed}18` };
      case "renamed":
        return { text: "Renamed", color: theme.accent, bg: `${theme.accent}18` };
      default:
        return { text: "Modified", color: theme.textMuted, bg: `${theme.textMuted}18` };
    }
  };

  const badge = getStatusDetails(file.status);

  return (
    <TouchableOpacity
      style={[
        styles.fileRow,
        isLandscape && styles.fileRowLandscape,
        { borderBottomColor: theme.border },
        isSelected && { backgroundColor: `${theme.accent}18` },
      ]}
      onPress={() => onSelectFile(file)}
      activeOpacity={0.7}
    >
      <TouchableOpacity
        style={styles.checkboxTouch}
        onPress={() => onToggleStageFile(file)}
      >
        <Ionicons
          name={file.staged ? "checkbox" : "square-outline"}
          size={isLandscape ? 15 : 17}
          color={file.staged ? theme.accent : theme.textMuted}
        />
      </TouchableOpacity>
      <View style={styles.filePathCol}>
        <Text
          style={[
            styles.fileName,
            isLandscape && styles.fileNameLandscape,
            { color: theme.textPrimary },
            isSelected && { color: theme.accent, fontWeight: "700" },
          ]}
          numberOfLines={1}
        >
          {file.filename}
        </Text>
        {file.path !== file.filename && (
          <Text
            style={[
              styles.filePath,
              isLandscape && styles.filePathLandscape,
              { color: theme.textMuted },
            ]}
            numberOfLines={1}
          >
            {file.path}
          </Text>
        )}
      </View>
      <View
        style={[
          styles.statusBadge,
          isLandscape && styles.statusBadgeLandscape,
          { backgroundColor: badge.bg },
        ]}
      >
        <Text
          style={[
            styles.statusBadgeText,
            isLandscape && styles.statusBadgeTextLandscape,
            { color: badge.color },
          ]}
        >
          {badge.text}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  fileRowLandscape: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 6,
  },
  checkboxTouch: {
    padding: 2,
  },
  filePathCol: {
    flex: 1,
  },
  fileName: {
    fontSize: 12.5,
    fontWeight: "500",
  },
  fileNameLandscape: {
    fontSize: 11.5,
    fontWeight: "600",
  },
  filePath: {
    fontSize: 10,
    marginTop: 1,
  },
  filePathLandscape: {
    fontSize: 9,
    marginTop: 0.5,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  statusBadgeLandscape: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  statusBadgeTextLandscape: {
    fontSize: 8.5,
    fontWeight: "700",
  },
});
