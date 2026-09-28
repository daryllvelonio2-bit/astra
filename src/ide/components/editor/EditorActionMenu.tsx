import React, { useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Pressable,
  useWindowDimensions,
} from "react-native";
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

const MENU_WIDTH = 190;

/**
 * EditorActionMenu — overflow (⋯) dropdown strip for secondary editor actions.
 * Anchored directly below the 3-dot button.
 */
export function EditorActionMenu({
  theme,
  visible,
  onClose,
  onOpen,
  actions,
  accessibilityLabel = "More editor actions",
}: EditorActionMenuProps) {
  const { width: winW } = useWindowDimensions();
  const btnRef = useRef<View>(null);
  const [coords, setCoords] = useState<{ top: number; right: number }>({ top: 44, right: 8 });

  if (actions.length === 0) return null;

  const handlePress = () => {
    btnRef.current?.measureInWindow((x, y, width, height) => {
      if (y !== undefined && height !== undefined) {
        const top = y + height + 4;
        const right = Math.max(8, winW - (x + width));
        setCoords({ top, right });
      }
    });
    onOpen();
  };

  return (
    <>
      <TouchableOpacity
        ref={btnRef}
        onPress={handlePress}
        style={styles.moreBtn}
        accessibilityLabel={accessibilityLabel}
      >
        <Ionicons name="ellipsis-horizontal" size={18} color={theme.textSecondary} />
      </TouchableOpacity>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View
          style={[
            styles.dropdown,
            {
              backgroundColor: theme.bgElevated,
              borderColor: theme.border,
              top: coords.top,
              right: coords.right,
            },
          ]}
        >
          {actions.map((action, index) => (
            <TouchableOpacity
              key={action.key}
              style={[
                styles.item,
                index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
              ]}
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
                numberOfLines={1}
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
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  dropdown: {
    position: "absolute",
    width: MENU_WIDTH,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 4,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 12,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
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
