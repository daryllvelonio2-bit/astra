import React, { useCallback } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FileNode } from "../types";
import { useFileDragDrop } from "./useFileDragDrop";
import { getFileIcon, sortNodes } from "./fileExplorerUtils";
import { subscribeIconTheme } from "../services/extensions/iconThemeService";
import { styles } from "./fileExplorerStyles";
import { useTheme } from "../../theme/themeContext";
import { useKeyboardMouseMode } from "../context/KeyboardMouseContext";
import { FileExplorerRow } from "./FileExplorerRow";
import { useVisibleExplorerRows, VisibleExplorerRow } from "./useVisibleExplorerRows";

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
  onOpenSearch?: () => void;
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
  onOpenSearch,
}: FileExplorerProps) {
  const { theme } = useTheme();
  const { keyboardMouseMode } = useKeyboardMouseMode();
  const touchCoordsRef = React.useRef({ x: 50, y: 100 });
  const [expandedFolders, setExpandedFolders] = React.useState<Record<string, boolean>>({});
  const expandedFoldersRef = React.useRef<Record<string, boolean>>({});
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

  // Re-measure folder positions when tree structure changes (debounced).
  // Skipped while the sidebar is being resized: onLayout fires every
  // frame during a drag and each measure → setState looped back into
  // another layout — the main resize lag. Re-measure once on release.
  React.useEffect(() => {
    if (isDraggingSidebar) return;
    const t = setTimeout(measureAllFolders, 100);
    return () => clearTimeout(t);
  }, [expandedFolders, files, measureAllFolders, isDraggingSidebar]);

  const [iconTick, setIconTick] = React.useState(0);
  React.useEffect(() => {
    return subscribeIconTheme(() => {
      setIconTick((t) => t + 1);
    });
  }, []);

  const handleInlineSubmit = useCallback(() => {
    const trimmed = inlineName.trim();
    if (!trimmed) {
      setIsCreating(false);
      return;
    }
    setIsCreating(false);
    setInlineName("");
    if (onCreateFile) onCreateFile(trimmed);
    else if (onQuickAddFile) onQuickAddFile();
  }, [inlineName, onCreateFile, onQuickAddFile]);

  const sortedFiles = React.useMemo(() => sortNodes(files), [files]);

  // Visible rows: flat list of expanded-path nodes. Identity stable
  // unless the tree or expansion changes — rows memo on this.
  const flatRows = useVisibleExplorerRows(sortedFiles, expandedFolders);

  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: VisibleExplorerRow }) => {
      const { node, depth } = item;
      return (
        <FileExplorerRow
          node={node}
          depth={depth}
          isActive={node.id === activeFileId}
          isExpanded={node.type === "folder" ? !!expandedFolders[node.id] : false}
          isHovered={hoveredTargetId === node.id}
          isBeingDragged={draggingNode?.id === node.id}
          iconTick={iconTick}
          touchCoordsRef={touchCoordsRef}
          onToggleFolder={toggleFolder}
          onSelectFile={onSelectFile}
          onLongPressNode={onLongPressNode}
          onPressOut={handlePressOut}
          onDragStart={startDrag}
          registerFolderHeaderRef={registerFolderHeaderRef}
        />
      );
    },
    [
      activeFileId,
      expandedFolders,
      hoveredTargetId,
      draggingNode,
      iconTick,
      touchCoordsRef,
      toggleFolder,
      onSelectFile,
      onLongPressNode,
      handlePressOut,
      startDrag,
      registerFolderHeaderRef,
    ]
  );

  const keyExtractor = useCallback((item: VisibleExplorerRow) => item.node.id, []);

  // FlatList only re-renders rows when these change (rows memo the rest).
  const listExtraData = React.useMemo(
    () => ({
      activeFileId,
      expandedFolders,
      hoveredTargetId,
      draggingId: draggingNode?.id ?? null,
      iconTick,
    }),
    [activeFileId, expandedFolders, hoveredTargetId, draggingNode, iconTick]
  );

  // Ghost icon cached: dragPos updates every finger move and re-renders
  // the badge — without this the SVG re-parses per move event.
  const ghostIcon = React.useMemo(
    () => (draggingNode && draggingNode.type !== "folder" ? getFileIcon(draggingNode.name) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draggingNode?.id, draggingNode?.name, iconTick]
  );

  void cancelDrag;

  return (
    <View
      ref={containerRef}
      collapsable={false}
      style={[styles.container, { backgroundColor: theme.bgSecondary, borderRightColor: theme.border }]}
      onLayout={() => {
        // No measuring mid-resize: layout fires per-frame while dragging
        // and measuring only feeds the next frame's lag (see effect above).
        if (!isDraggingSidebar) measureAllFolders();
      }}
      {...wrapperPanResponder.panHandlers}
    >
      <FlatList
        style={styles.scroll}
        data={flatRows}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        extraData={listExtraData}
        showsVerticalScrollIndicator={true}
        scrollEnabled={!draggingNode}
        // Virtualization: only visible rows mount, so per-frame layout
        // during resize touches a handful of views, not the whole tree.
        initialNumToRender={25}
        maxToRenderPerBatch={20}
        windowSize={7}
        removeClippedSubviews={true}
        {...({
          onContextMenu: (e: any) => {
            e.preventDefault?.();
            setIsCreating(true);
            setInlineName("");
          },
        } as any)}
        ListHeaderComponent={
          <>
            <View style={styles.headerContainer}>
              <Text style={[styles.header, { color: theme.textSecondary, flex: 1 }]} numberOfLines={1}>
                {projectName ? projectName.toUpperCase() : "EXPLORER"}
              </Text>
              {onOpenSearch && (
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={onOpenSearch}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Search in project"
                >
                  <Ionicons name="search-outline" size={14} color={theme.textMuted} />
                </TouchableOpacity>
              )}
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
          </>
        }
        ListEmptyComponent={
          !isCreating ? (
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
          ) : null
        }
        ListFooterComponent={
          draggingNode ? (
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
          ) : null
        }
      />

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
              ghostIcon
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
