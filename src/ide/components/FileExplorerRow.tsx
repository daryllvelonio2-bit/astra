import React, { useMemo } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FileNode } from "../types";
import { getFileIcon } from "./fileExplorerUtils";
import { styles } from "./fileExplorerStyles";
import { useTheme } from "../../theme/themeContext";

interface FileExplorerRowProps {
  node: FileNode;
  depth: number;
  isActive: boolean;
  isExpanded: boolean;
  isHovered: boolean;
  isBeingDragged: boolean;
  /** Bumped when the icon theme changes — invalidates the cached icon. */
  iconTick: number;
  touchCoordsRef: React.MutableRefObject<{ x: number; y: number }>;
  onToggleFolder: (folderId: string) => void;
  onSelectFile: (file: FileNode) => void;
  onLongPressNode?: (node: FileNode, coords: { x: number; y: number }) => void;
  onPressOut: () => void;
  onDragStart: (node: FileNode, x: number, y: number) => void;
  registerFolderHeaderRef: (id: string, ref: any, node: FileNode) => void;
}

/**
 * One memoized explorer row. Parent re-renders (scroll, drag ghost,
 * sidebar state) skip every row whose props are unchanged — the whole
 * point is that resize frames and ghost moves touch zero rows.
 * Theme comes from the hook (no theme object in props to break memo).
 */
function FileExplorerRowInner({
  node,
  depth,
  isActive,
  isExpanded,
  isHovered,
  isBeingDragged,
  iconTick,
  touchCoordsRef,
  onToggleFolder,
  onSelectFile,
  onLongPressNode,
  onPressOut,
  onDragStart,
  registerFolderHeaderRef,
}: FileExplorerRowProps) {
  const { theme } = useTheme();

  // Icon element cached per file/folder state — SvgXml re-parses its XML
  // on every render, which was the heaviest per-row cost in the tree.
  const icon = useMemo(() => {
    void iconTick;
    const isFolder = node.type === "folder";
    return getFileIcon(node.name, isFolder, isExpanded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.name, node.type, isExpanded, iconTick]);

  const indent = { paddingLeft: depth * 12 };

  if (node.type === "folder") {
    return (
      <View
        key={node.id}
        collapsable={false}
        style={[styles.folderContainer, isBeingDragged && { opacity: 0.35 }, indent]}
      >
        <View
          collapsable={false}
          ref={(el) => registerFolderHeaderRef(node.id, el, node)}
          style={[styles.folderHeader, isHovered && { backgroundColor: `${theme.accent}25`, borderColor: theme.accent, borderWidth: 1 }]}
        >
          <TouchableOpacity
            style={{ flex: 1, flexDirection: "row", alignItems: "center" }}
            onPress={() => onToggleFolder(node.id)}
            onPressIn={(e) => {
              touchCoordsRef.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
            }}
            onPressOut={onPressOut}
            onLongPress={() => {
              onDragStart(node, touchCoordsRef.current.x, touchCoordsRef.current.y);
            }}
            {...({
              onContextMenu: (e: any) => {
                e.preventDefault?.();
                const pageX = e.nativeEvent?.pageX ?? touchCoordsRef.current.x;
                const pageY = e.nativeEvent?.pageY ?? touchCoordsRef.current.y;
                onLongPressNode?.(node, { x: pageX, y: pageY });
              },
            } as any)}
            activeOpacity={0.7}
            delayLongPress={350}
          >
            <Ionicons
              name={isExpanded ? "chevron-down" : "chevron-forward"}
              size={12}
              color={isHovered ? theme.accent : theme.textMuted}
              style={{ marginRight: 4 }}
            />
            <View style={{ marginRight: 6 }}>{icon}</View>
            <Text style={[styles.folderName, { color: theme.textPrimary }, isHovered && { color: theme.accent, fontWeight: "700" }]} numberOfLines={1}>
              {node.name}
            </Text>
            {isHovered && <Ionicons name="arrow-down-circle" size={14} color={theme.accent} style={{ marginLeft: 4 }} />}
          </TouchableOpacity>

          {onLongPressNode && !isHovered && (
            <TouchableOpacity
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.moreActionBtn}
              onPress={(e) => {
                onLongPressNode(node, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
              }}
            >
              <Ionicons name="ellipsis-vertical" size={12} color={theme.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View
      key={node.id}
      collapsable={false}
      style={[styles.fileWrapper, isBeingDragged && { opacity: 0.35 }, indent]}
    >
      <View
        style={[
          styles.fileItem,
          isActive && {
            backgroundColor: `${theme.accent}26`,
            borderColor: theme.accent,
            borderWidth: 1,
          },
        ]}
      >
        <TouchableOpacity
          style={{ flex: 1, flexDirection: "row", alignItems: "center" }}
          onPress={() => onSelectFile(node)}
          onPressIn={(e) => {
            touchCoordsRef.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
          }}
          onPressOut={onPressOut}
          onLongPress={() => {
            onDragStart(node, touchCoordsRef.current.x, touchCoordsRef.current.y);
          }}
          {...({
            onContextMenu: (e: any) => {
              e.preventDefault?.();
              const pageX = e.nativeEvent?.pageX ?? touchCoordsRef.current.x;
              const pageY = e.nativeEvent?.pageY ?? touchCoordsRef.current.y;
              onLongPressNode?.(node, { x: pageX, y: pageY });
            },
          } as any)}
          activeOpacity={0.7}
          delayLongPress={350}
        >
          <View style={styles.fileIconWrapper}>{icon}</View>
          <Text
            style={[
              styles.fileName,
              { color: theme.textPrimary },
              isActive && { color: theme.accent, fontWeight: "700" },
            ]}
            numberOfLines={1}
          >
            {node.name}
          </Text>
        </TouchableOpacity>

        {onLongPressNode && (
          <TouchableOpacity
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.moreActionBtn}
            onPress={(e) => {
              onLongPressNode(node, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
            }}
          >
            <Ionicons name="ellipsis-vertical" size={12} color={theme.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export const FileExplorerRow = React.memo(FileExplorerRowInner);
