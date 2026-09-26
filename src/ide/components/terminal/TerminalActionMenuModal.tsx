import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../../theme/themeContext";

interface ActionItem {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  destructive?: boolean;
}

interface TerminalActionMenuModalProps {
  visible: boolean;
  onClose: () => void;
  theme: ThemeColors;
  onCopyOutput?: () => void;
  onPasteClipboard?: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRestartSession: () => void;
  onClearSession: () => void;
  isSplit?: boolean;
  onToggleSplit?: () => void;
}

export function TerminalActionMenuModal({
  visible,
  onClose,
  theme,
  onCopyOutput,
  onPasteClipboard,
  onZoomIn,
  onZoomOut,
  onRestartSession,
  onClearSession,
  isSplit,
  onToggleSplit,
}: TerminalActionMenuModalProps) {
  const actions: ActionItem[] = [
    ...(onCopyOutput
      ? [
          {
            id: "copy",
            label: "Copy Output to Clipboard",
            icon: "copy-outline" as keyof typeof Ionicons.glyphMap,
            onPress: onCopyOutput,
          },
        ]
      : []),
    ...(onPasteClipboard
      ? [
          {
            id: "paste",
            label: "Paste from Clipboard",
            icon: "clipboard-outline" as keyof typeof Ionicons.glyphMap,
            onPress: onPasteClipboard,
          },
        ]
      : []),
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={[styles.backdrop, { backgroundColor: theme.overlay }]}
        activeOpacity={1}
        onPress={onClose}
      >
        <View
          style={[
            styles.menuContainer,
            { backgroundColor: theme.bgElevated, borderColor: theme.border },
          ]}
          onStartShouldSetResponder={() => true}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>
              Terminal Options
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={16} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Action List */}
          <View style={styles.list}>
            {actions.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.actionRow}
                activeOpacity={0.7}
                onPress={() => {
                  onClose();
                  item.onPress();
                }}
              >
                <View
                  style={[
                    styles.iconBox,
                    {
                      backgroundColor: item.destructive
                        ? `${theme.accentRed || "#e06c75"}15`
                        : `${theme.accent}12`,
                    },
                  ]}
                >
                  <Ionicons
                    name={item.icon}
                    size={16}
                    color={item.destructive ? theme.accentRed || "#e06c75" : theme.accent}
                  />
                </View>
                <Text
                  style={[
                    styles.actionLabel,
                    { color: item.destructive ? theme.accentRed || "#e06c75" : theme.textPrimary },
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  menuContainer: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  list: {
    paddingVertical: 6,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
});
