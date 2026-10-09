import React, { useCallback } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FileNode } from "../types";
import { useFileDragDrop } from "./useFileDragDrop";
import { getFileIcon, sortNodesStable } from "./fileExplorerUtils";
import { subscribeIconTheme, isIconThemeLoaded, primeIconThemeSvgs, reloadActiveIconTheme } from "../services/extensions/iconThemeService";
import { styles } from "./fileExplorerStyles";
import { useTheme } from "../../theme/themeContext";
import { useKeyboardMouseMode } from "../context/KeyboardMouseContext";
import { FileExplorerRow } from "./FileExplorerRow";
import { useVisibleExplorerRows, VisibleExplorerRow } from "./useVisibleExplorerRows";
import { useLazyExplorerTree } from "./useLazyExplorerTree";
import { FileExplorerAddMenu } from "./FileExplorerAddMenu";

interface FileExplorerProps {
  projectName?: string;
  workspaceId: string;
  files: FileNode[];
  onSelectFile: (file: FileNode) => void;
  activeFileId?: string;
  onToggleCollapse: () => void;
  onLongPressNode?: (node: FileNode, coords: { x: number; y: number }) => void;
  onQuickAddFile?: () => void;
  onCreateFile?: (name: string, kind?: "file" | "folder", target?: FileNode | null) => void;
  onMoveNode?: (source: FileNode, targetFolder: FileNode | null) => void;
  resizerPanHandlers?: any;
  isDraggingSidebar?: boolean;
  onRefresh?: () => void;
  onOpenSearch?: () => void;
}

function FileExplorerInner({
  projectName,
  workspaceId,
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
  // What the inline row is about to create. Before this there was only the
  // "name/" suffix convention, which nothing on screen explained.
  const [createKind, setCreateKind] = React.useState<"file" | "folder">("file");
  const [newMenu, setNewMenu] = React.useState(false);
  const addBtnRef = React.useRef<View>(null);
  const [addAnchor, setAddAnchor] = React.useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // The + menu now lives in a screen-level Modal (FileExplorerAddMenu), so it
  // escapes the sidebar's overflow:hidden wrapper. Measure the button in window
  // coordinates so the menu can anchor to it and clamp itself onto the screen.
  const openAddMenu = React.useCallback(() => {
    if (newMenu) {
      setNewMenu(false);
      return;
    }
    addBtnRef.current?.measureInWindow((x, y, width, height) => {
      setAddAnchor({ x, y, width, height });
      setNewMenu(true);
    });
  }, [newMenu]);

  // Lazy tree (own hook): shallow base + fetch-on-expand overlays.
  const { mergedFiles, expandFolder } = useLazyExplorerTree(
    workspaceId,
    files,
    expandedFoldersRef,
    setExpandedFolders
  );

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
        expandFolder(targetFolder.id);
      }
      if (onMoveNode) onMoveNode(source, targetFolder);
    },
    onExpandFolder: (folderId) => {
      expandFolder(folderId);
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
  }, [expandedFolders, mergedFiles, measureAllFolders, isDraggingSidebar]);

  const [iconTick, setIconTick] = React.useState(0);
  React.useEffect(() => {
    return subscribeIconTheme(() => {
      setIconTick((t) => t + 1);
    });
  }, []);

  // Project opened/switched: resolve themed icons without user interaction.
  // Prime fires all theme SVG reads up front (each completion notifies and
  // bumps iconTick via the subscription above). The delayed bump covers the
  // cold case where the definition itself was still loading — it fires only
  // when new reads actually started, so warm opens cost zero extra renders.
  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      try {
        if (!isIconThemeLoaded()) {
          await reloadActiveIconTheme().catch(() => null);
          if (cancelled) return;
        }
        const kicked = primeIconThemeSvgs();
        if (kicked > 0 && !cancelled) {
          timer = setTimeout(() => setIconTick((t) => t + 1), 900);
        }
      } catch (_) {}
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  const handleInlineSubmit = useCallback(() => {
    const trimmed = inlineName.trim();
    if (!trimmed) {
      setIsCreating(false);
      return;
    }
    setIsCreating(false);
    setInlineName("");
    setNewMenu(false);
    // target === null is an explicit request for the workspace ROOT: the inline
    // row sits at the tree's top level, and passing the last long-pressed folder
    // instead is how a .env could end up buried in a subfolder.
    if (onCreateFile) onCreateFile(trimmed, createKind, null);
    else if (onQuickAddFile) onQuickAddFile();
  }, [inlineName, onCreateFile, onQuickAddFile, createKind]);

  // Stable sort: same order+subtree returns the previous array with the
  // same node objects, so memo'd rows skip re-render on every refresh.
  const prevSortedRef = React.useRef<FileNode[]>([]);
  const sortedFiles = React.useMemo(() => {
    const stable = sortNodesStable(prevSortedRef.current, mergedFiles);
    prevSortedRef.current = stable;
    return stable;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mergedFiles]);

  // Visible rows: flat list of expanded-path nodes. Identity stable
  // unless the tree or expansion changes — rows memo on this.
  const flatRows = useVisibleExplorerRows(sortedFiles, expandedFolders);

  const toggleFolder = useCallback((folderId: string) => {
    if (expandedFoldersRef.current[folderId]) {
      setExpandedFolders((prev) => {
        const next = { ...prev };
        delete next[folderId];
        return next;
      });
    } else {
      expandFolder(folderId);
    }
  }, [expandFolder]);

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
      <View style={styles.headerContainer}>
        <Text style={[styles.header, { color: theme.textSecondary, flex: 1 }]} numberOfLines={1}>
          EXPLORER
        </Text>
        {/* The discoverable way in. Creation existed but only behind a long-press
            on the list background, which is why "i cant make a .env file here"
            happened at all. */}
        <TouchableOpacity
          ref={addBtnRef}
          style={{ width: 26, height: 26, alignItems: "center", justifyContent: "center" }}
          onPress={openAddMenu}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="New file or folder"
        >
          <Ionicons name="add" size={19} color={newMenu ? theme.accent : theme.textSecondary} />
        </TouchableOpacity>
      </View>
      <FileExplorerAddMenu
        visible={newMenu}
        anchor={addAnchor}
        onClose={() => setNewMenu(false)}
        onSelectFile={() => { setCreateKind("file"); setInlineName(""); setIsCreating(true); }}
        onSelectFolder={() => { setCreateKind("folder"); setInlineName(""); setIsCreating(true); }}
      />
      {isCreating && (
        <View style={[styles.inlineCreateRow, { backgroundColor: theme.bgInput, borderColor: theme.accent }]}>
          <Ionicons
            name={inlineName.endsWith("/") || createKind === "folder" ? "folder" : "document-text-outline"}
            size={14}
            color={inlineName.endsWith("/") || createKind === "folder" ? theme.accentGold : theme.accent}
            style={{ marginRight: 4 }}
          />
          <TextInput
            style={[styles.inlineInput, { color: theme.textPrimary }]}
            placeholder={createKind === "folder" ? "New folder name…" : "New file name (.env, index.js…)"}
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
          <TouchableOpacity
            onPress={() => { setIsCreating(false); setInlineName(""); }}
            style={styles.inlineBtn}
            accessibilityLabel="Cancel"
          >
            <Ionicons name="close" size={15} color={theme.textMuted} />
          </TouchableOpacity>
        </View>
      )}
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
