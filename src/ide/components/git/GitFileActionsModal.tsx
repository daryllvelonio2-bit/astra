import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Alert,
  useWindowDimensions,
} from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import type { GitFileStatus } from "./types";

export interface FileActionHandlers {
  discard: () => void;
  ignoreFile: () => void;
  ignoreExtension: () => void;
  copyPath: () => void;
  openOnGitHub: () => void; // no-op hidden when null URL
}

interface GitFileActionsModalProps {
  visible: boolean;
  anchor: { x: number; y: number };
  file: GitFileStatus | null;
  canOpenOnGitHub: boolean;
  busy: boolean;
  onClose: () => void;
  actions: FileActionHandlers;
}

const MENU_WIDTH = 250;

/**
 * GitHub-Desktop-style long-press menu for a changed file:
 * Discard changes / Ignore file / Ignore extension / Copy path / View on GitHub.
 * Floating, anchored beside the pressed row (project popup convention).
 */
export function GitFileActionsModal({
  visible,
  anchor,
  file,
  canOpenOnGitHub,
  busy,
  onClose,
  actions,
}: GitFileActionsModalProps) {
  const { theme } = useTheme();
  const { width: winW, height: winH } = useWindowDimensions();
  if (!file) return null;

  const menuH = 6 * 44 + 56 + (canOpenOnGitHub ? 0 : -44); // rows + header pad
  const top = Math.min(Math.max(anchor.y - 10, 60), Math.max(winH - menuH - 20, 60));
  const left = Math.max(Math.min(anchor.x - MENU_WIDTH + 10, winW - MENU_WIDTH - 12), 12);

  const confirmDiscard = () => {
    Alert.alert(
      "Discard changes?",
      `${file.filename} will be reverted. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: () => actions.discard() },
      ]
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <View
          style={[
            styles.sheet,
            { top, left, backgroundColor: theme.bgElevated ?? theme.bgSecondary, borderColor: theme.border },
          ]}
        >
          <Text style={[styles.header, { color: theme.textMuted }]} numberOfLines={1}>
            {file.path}
          </Text>

          <Row
            icon="trash"
            label="Discard changes"
            danger
            disabled={busy}
            theme={theme}
            onPress={() => {
              onClose();
              confirmDiscard();
            }}
          />
          <Row
            icon="eye-closed"
            label="Ignore file"
            disabled={busy}
            theme={theme}
            onPress={() => {
              actions.ignoreFile();
              onClose();
            }}
          />
          <Row
            icon="file-symlink-file"
            label="Ignore extension"
            disabled={busy}
            theme={theme}
            onPress={() => {
              actions.ignoreExtension();
              onClose();
            }}
          />
          <Row
            icon="copy"
            label="Copy path"
            disabled={busy}
            theme={theme}
            onPress={() => {
              actions.copyPath();
              onClose();
            }}
          />
          {canOpenOnGitHub && (
            <Row
              icon="link-external"
              label="View on GitHub"
              disabled={busy}
              theme={theme}
              onPress={() => {
                actions.openOnGitHub();
                onClose();
              }}
            />
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

function Row({
  icon,
  label,
  danger,
  disabled,
  theme,
  onPress,
}: {
  icon: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  theme: any;
  onPress: () => void;
}) {
  const color = danger ? theme.accentRed : theme.textPrimary;
  return (
    <TouchableOpacity
      style={[styles.row, disabled && styles.rowDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
    >
      <Octicons name={icon as any} size={14} color={danger ? theme.accentRed : theme.textSecondary} />
      <Text style={[styles.rowText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    position: "absolute",
    width: MENU_WIDTH,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },
  header: {
    fontSize: 10.5,
    fontWeight: "600",
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 8,
    letterSpacing: 0.2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 44,
    paddingHorizontal: 12,
  },
  rowDisabled: { opacity: 0.45 },
  rowText: { fontSize: 13, fontWeight: "600", flex: 1 },
});