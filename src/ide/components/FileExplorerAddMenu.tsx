import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/themeContext";

const MENU_WIDTH = 196;
const ROW_HEIGHT = 44; // icon row: 11pt padding above and below
const EDGE = 12; // minimum clearance kept from every screen edge

export interface AddMenuAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FileExplorerAddMenuProps {
  visible: boolean;
  /** Window coordinates of the explorer + button, from measureInWindow. */
  anchor: AddMenuAnchor | null;
  onClose: () => void;
  onSelectFile: () => void;
  onSelectFolder: () => void;
}

/**
 * The explorer's + (New file / New folder) menu.
 *
 * Rendered in a transparent RN Modal so it is NOT clipped by the sidebar's
 * `overflow: hidden` wrapper. The previous in-tree dropdown was anchored with
 * `right: 8, minWidth: 156`, so once the sidebar fell below ~164pt wide (its
 * default is 130, its minimum 90) the menu spilled past the screen's edge and
 * was sliced.
 *
 * It hangs under the + button, right-aligned to it, then clamped against the
 * live window on all four sides — so the whole menu, both action rows
 * included, stays on screen in portrait and landscape alike.
 */
export function FileExplorerAddMenu({
  visible,
  anchor,
  onClose,
  onSelectFile,
  onSelectFolder,
}: FileExplorerAddMenuProps) {
  const { theme } = useTheme();
  const { width: winW, height: winH } = useWindowDimensions();
  if (!visible || !anchor) return null;

  const menuH = ROW_HEIGHT * 2; // two rows, no vertical card padding
  // Right-align under the button, then clamp so the menu never crosses an edge.
  const left = Math.min(
    Math.max(anchor.x + anchor.width - MENU_WIDTH, EDGE),
    Math.max(winW - MENU_WIDTH - EDGE, EDGE)
  );
  const top = Math.min(
    Math.max(anchor.y + anchor.height + 4, EDGE),
    Math.max(winH - menuH - EDGE, EDGE)
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        style={[styles.backdrop, { backgroundColor: theme.overlay }]}
        activeOpacity={1}
        onPress={onClose}
      >
        <View
          style={[
            styles.menu,
            { top, left, backgroundColor: theme.bgSecondary, borderColor: theme.border },
          ]}
        >
          <TouchableOpacity
            style={styles.row}
            onPress={() => {
              onClose();
              onSelectFile();
            }}
          >
            <Ionicons name="document-text-outline" size={15} color={theme.accent} />
            <Text style={[styles.rowText, { color: theme.textPrimary }]} numberOfLines={1}>
              New file
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.row, { borderTopWidth: 1, borderTopColor: theme.border }]}
            onPress={() => {
              onClose();
              onSelectFolder();
            }}
          >
            <Ionicons name="folder-outline" size={15} color={theme.accentGold} />
            <Text style={[styles.rowText, { color: theme.textPrimary }]} numberOfLines={1}>
              New folder
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  menu: {
    position: "absolute",
    width: MENU_WIDTH,
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  rowText: {
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
});
