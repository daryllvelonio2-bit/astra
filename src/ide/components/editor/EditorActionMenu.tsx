import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../../theme/themeContext";

export interface EditorMenuAction {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  run: () => void;
}

interface EditorActionMenuProps {
  theme: ThemeColors;
  visible: boolean;
  onClose: () => void;
  onOpen: () => void;
  actions: EditorMenuAction[];
  accessibilityLabel?: string;
}

/**
 * EditorActionMenu — overflow (⋯) sheet for secondary editor actions.
 * Inline header keeps max 3 actions (Edit, Run, ⋯); everything else
 * (format, split, zoom, settings, exit) lives in this bottom sheet
 * with a solid elevated background and border.
 */
export function EditorActionMenu({
  theme,
  visible,
  onClose,
  onOpen,
  actions,
  accessibilityLabel = "More editor actions",
}: EditorActionMenuProps) {
  // The sheet floats above the nav bar — a fixed bottom lets 3-button
  // navigation paint over the last action row.
  const insets = useSafeAreaInsets();
  if (actions.length === 0) return null;

  return (
    <>
      <TouchableOpacity
        onPress={onOpen}
        style={styles.moreBtn}
        accessibilityLabel={accessibilityLabel}
      >
        <Ionicons name="ellipsis-horizontal" size={18} color={theme.textSecondary} />
      </TouchableOpacity>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.bgElevated, borderColor: theme.border },
            { bottom: Math.max(24, insets.bottom + 12) },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          {actions.map((action) => (
            <TouchableOpacity
              key={action.key}
              style={styles.item}
              onPress={() => {
                onClose();
                action.run();
              }}
              activeOpacity={0.7}
            >
              <Ionicons
                name={action.icon}
                size={16}
                color={action.destructive ? theme.accentRed : theme.textPrimary}
                style={styles.itemIcon}
              />
              <Text
                style={[
                  styles.itemText,
                  { color: action.destructive ? theme.accentRed : theme.textPrimary },
                ]}
              >
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  moreBtn: {
    padding: 6,
    borderRadius: 4,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 24,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 4,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    overflow: "hidden",
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    marginVertical: 6,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  itemIcon: {
    marginRight: 10,
  },
  itemText: {
    fontSize: 13,
    fontWeight: "500",
  },
});
