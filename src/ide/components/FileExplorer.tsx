import React, { useEffect, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FileNode } from "../types";
import { useFileDragDrop } from "./useFileDragDrop";
import { getFileIcon, sortNodes } from "./fileExplorerUtils";
import { subscribeIconTheme } from "../services/extensions/iconThemeService";
import { styles } from "./fileExplorerStyles";
import { useTheme } from "../../theme/themeContext";
import { useKeyboardMouseMode } from "../context/KeyboardMouseContext";

interface FileExplorerProps {
  projectName?: string;
  files: FileNode[];
  onSelectFile: (file: FileNode) => void;
  activeFileId?: string;
  onToggleCollapse: () => void;
  onLongPressNode?: (node: FileNode, coords: { x: number; y: number }) => void;
  onQuickAddFile?: () => void;
  onCreateFile?: (name: string) => void;
  onMoveNode?: (source: FileNode, targetFolder: FileNode | null) => void;
  resizerPanHandlers?: any;
  isDraggingSidebar?: boolean;
  onRefresh?: () => void;
}

function FileExplorerInner({
  projectName,
  files,
  onSelectFile,
  activeFileId,
  onToggleCollapse: _onToggleCollapse,
  onLongPressNode,
  onQuickAddFile,
  onCreateFile,
  onMoveNode,
  resizerPanHandlers,
  isDraggingSidebar,
  onRefresh,
}: FileExplorerProps) {
  const { theme } = useTheme();
  const { keyboardMouseMode } = useKeyboardMouseMode();
  const touchCoordsRef = useRef({ x: 50, y: 100 });
  const [expandedFolders, setExpandedFolders] = React.useState<Record<string, boolean>>({});
  const expandedFoldersRef = useRef<Record<string, boolean>>({});
  expandedFoldersRef.current = expandedFolders;
  const [isCreating, setIsCreating] = React.useState(false);
  const [inlineName, setInlineName] = React.useState("");

  const {
    draggingNode,
    hoveredTargetId,
    dragPos,
    containerOffset,
    containerRef,
    startDrag,
    cancelDrag,
    handlePressOut,
    measureAllFolders,
    registerFolderHeaderRef,
    registerRootDropRef,
    wrapperPanResponder,
  } = useFileDragDrop({
    onMoveNode: (source, targetFolder) => {
      if (targetFolder) {
        setExpandedFolders((prev) => ({ ...prev, [targetFolder.id]: true }));
      }
      if (onMoveNode) onMoveNode(source, targetFolder);
    },
    onExpandFolder: (folderId) => {
      setExpandedFolders((prev) => (prev[folderId] ? prev : { ...prev, [folderId]: true }));
    },
    onCollapseFolder: (folderId) => {
      setExpandedFolders((prev) => {
        if (!prev[folderId]) return prev;
        const next = { ...prev };
        delete next[folderId];
        return next;
      });
    },
    isFolderExpanded: (folderId) => !!expandedFoldersRef.current[folderId],
  });

  // Re-measure folder positions when tree structure changes (debounced)
  useEffect(() => {
    const t = setTimeout(measureAllFolders, 100);
    return () => clearTimeout(t);
  }, [expandedFolders, files, measureAllFolders]);

  const [, setIconTick] = React.useState(0);
  useEffect(() => {
    return subscribeIconTheme(() => {
      setIconTick((t) => t + 1);
    });
  }, []);

  const handleInlineSubmit = () => {
    const trimmed = inlineName.trim();
    if (!trimmed) {
      setIsCreating(false);
      return;
    }
    setIsCreating(false);
    setInlineName("");
    if (onCreateFile) onCreateFile(trimmed);
    else if (onQuickAddFile) onQuickAddFile();
  };

  const sortedFiles = React.useMemo(() => sortNodes(files), [files]);

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const renderNode = (node: FileNode) => {
    const isActive = node.id === activeFileId;
    const isBeingDragged = draggingNode?.id === node.id;

    if (node.type === "folder") {
      const isExpanded = !!expandedFolders[node.id];
      const isHovered = hoveredTargetId === node.id;

      return (
        <View
          key={node.id}
          collapsable={false}
          style={[styles.folderContainer, isBeingDragged && { opacity: 0.35 }]}
        >
          <View
            collapsable={false}
            ref={(el) => registerFolderHeaderRef(node.id, el, node)}
            style={[styles.folderHeader, isHovered && { backgroundColor: `${theme.accent}25`, borderColor: theme.accent, borderWidth: 1 }]}
          >
            <TouchableOpacity
              style={{ flex: 1, flexDirection: "row", alignItems: "center" }}
              onPress={() => toggleFolder(node.id)}
              onPressIn={(e) => {
                touchCoordsRef.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
              }}
              onPressOut={handlePressOut}
              onLongPress={() => {
                startDrag(node, touchCoordsRef.current.x, touchCoordsRef.current.y);
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
              <View style={{ marginRight: 6 }}>
                {getFileIcon(node.name, true, isExpanded)}
              </View>
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

          {isExpanded && node.children && (
            <View collapsable={false} style={styles.childrenContainer}>
              {node.children.map(renderNode)}
            </View>
          )}
        </View>
      );
    }

    // File row
    return (
      <View
        key={node.id}
        collapsable={false}
        style={[styles.fileWrapper, isBeingDragged && { opacity: 0.35 }]}
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
            onPressOut={handlePressOut}
            onLongPress={() => {
              startDrag(node, touchCoordsRef.current.x, touchCoordsRef.current.y);
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
            <View style={styles.fileIconWrapper}>{getFileIcon(node.name)}</View>
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
  };

  return (
    <View
      ref={containerRef}
      collapsable={false}
      style={[styles.container, { backgroundColor: theme.bgSecondary, borderRightColor: theme.border }]}
      onLayout={() => measureAllFolders()}
      {...wrapperPanResponder.panHandlers}
    >
      <View style={styles.headerContainer}>
        <Text style={[styles.header, { color: theme.textSecondary, flex: 1 }]} numberOfLines={1}>
          {projectName ? projectName.toUpperCase() : "EXPLORER"}
        </Text>
        {onRefresh && (
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={onRefresh}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Refresh Explorer"
          >
            <Ionicons name="refresh-outline" size={14} color={theme.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={true}
        scrollEnabled={!draggingNode}
        {...({
          onContextMenu: (e: any) => {
            e.preventDefault?.();
            setIsCreating(true);
            setInlineName("");
          },
        } as any)}
      >
        {isCreating && (
          <View style={[styles.inlineCreateRow, { backgroundColor: theme.bgInput, borderColor: theme.accent }]}>
            <Ionicons
              name={inlineName.endsWith("/") ? "folder" : "document-text-outline"}
              size={14}
              color={inlineName.endsWith("/") ? theme.accentGold : theme.accent}
              style={{ marginRight: 4 }}
            />
            <TextInput
              style={[styles.inlineInput, { color: theme.textPrimary }]}
              placeholder="filename (or folder/)..."
              placeholderTextColor={theme.textMuted}
              value={inlineName}
              onChangeText={setInlineName}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              showSoftInputOnFocus={!keyboardMouseMode}
              onSubmitEditing={handleInlineSubmit}
              returnKeyType="done"
              onKeyPress={(e) => {
                if (e.nativeEvent.key === "Escape") {
                  setIsCreating(false);
                  setInlineName("");
                }
              }}
            />
            <TouchableOpacity onPress={handleInlineSubmit} style={styles.inlineBtn}>
              <Ionicons name="checkmark" size={14} color={theme.accentGreen} />
            </TouchableOpacity>
          </View>
        )}
        {sortedFiles.length === 0 && !isCreating ? (
          <TouchableOpacity
            style={styles.emptyContainer}
            onPress={() => {
              setIsCreating(true);
              setInlineName("");
            }}
          >
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>No files</Text>
            <Text style={[styles.emptySubtext, { color: theme.accent }]}>+ Add file</Text>
          </TouchableOpacity>
        ) : (
          sortedFiles.map(renderNode)
        )}

        {/* Drop Zone for moving to root workspace level */}
        {draggingNode && (
          <View
            ref={registerRootDropRef}
            collapsable={false}
            onLayout={measureAllFolders}
            style={[
              styles.rootDropZone,
              { backgroundColor: theme.bgTertiary, borderColor: theme.border },
              hoveredTargetId === "ROOT_WORKSPACE" && { borderColor: theme.accent, backgroundColor: `${theme.accent}25` },
            ]}
          >
            <Ionicons
              name="home-outline"
              size={14}
              color={hoveredTargetId === "ROOT_WORKSPACE" ? theme.accent : theme.textMuted}
            />
            <Text
              style={[
                styles.rootDropZoneText,
                { color: hoveredTargetId === "ROOT_WORKSPACE" ? theme.accent : theme.textMuted },
                hoveredTargetId === "ROOT_WORKSPACE" && { fontWeight: "700" },
              ]}
            >
              Move to workspace root
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Floating Ghost Badge: Follows the user's finger in real-time */}
      {draggingNode && (
        <View
          pointerEvents="none"
          style={[
            styles.dragGhost,
            { backgroundColor: theme.bgElevated, borderColor: theme.accent },
            {
              top: Math.max(0, dragPos.y - containerOffset.y - 30),
              left: Math.max(0, dragPos.x - containerOffset.x - 20),
            },
          ]}
        >
          <View style={styles.dragGhostIcon}>
            {draggingNode.type === "folder" ? (
              <Ionicons name="folder" size={15} color={theme.accentGold} />
            ) : (
              getFileIcon(draggingNode.name)
            )}
          </View>
          <Text style={[styles.dragGhostText, { color: theme.textPrimary }]} numberOfLines={1}>
            {draggingNode.name}
          </Text>
        </View>
      )}

      {/* Lower Resize Box */}
      <View
        style={[styles.bottomResizeBox, { backgroundColor: theme.bgSecondary }, isDraggingSidebar && { backgroundColor: `${theme.accent}14` }]}
        {...(resizerPanHandlers || {})}
      >
        <View style={[styles.resizeIndicator, isDraggingSidebar && { backgroundColor: theme.accent }]} />
      </View>
    </View>
  );
}

export const FileExplorer = React.memo(FileExplorerInner);
