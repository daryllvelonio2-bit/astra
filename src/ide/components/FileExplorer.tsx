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
import { loadDirectoryChildren } from "../services/workspaceTreeService";

interface FileExplorerProps {
  projectName?: string;
  workspaceId: string;
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

  // Lazy children: shallow tree carries 1 level; deeper folders fetch on
  // expand (one native listing each). Overlay presence means "loaded".
  const [loadedChildren, setLoadedChildren] = React.useState<Record<string, { path: string; children: FileNode[] }>>({});
  const loadedRef = React.useRef<Record<string, { path: string; children: FileNode[] }>>({});
  loadedRef.current = loadedChildren;
  const loadingRef = React.useRef<Set<string>>(new Set());
  const wsIdRef = React.useRef(workspaceId);
  wsIdRef.current = workspaceId;

  // Workspace switch: drop caches (ids are namespaced, but stale overlays
  // would linger in memory behind the new tree).
  React.useEffect(() => {
    setLoadedChildren({});
    loadedRef.current = {};
    setExpandedFolders({});
  }, [workspaceId]);

  // Tree refreshed (auto-refresh / pull): re-fetch open folders so expanded
  // dirs show fresh contents instead of going stale behind the new tree.
  const filesTickRef = React.useRef(0);
  React.useEffect(() => {
    if (++filesTickRef.current <= 1) return;
    const open = Object.keys(expandedFoldersRef.current).filter((id) => loadedRef.current[id]);
    if (!open.length || !wsIdRef.current) return;
    let cancelled = false;
    (async () => {
      for (const id of open) {
        const entry = loadedRef.current[id];
        if (!entry) continue;
        try {
          const children = await loadDirectoryChildren(wsIdRef.current, entry.path);
          if (!cancelled) setLoadedChildren((prev) => ({ ...prev, [id]: { path: entry.path, children } }));
        } catch (_) {}
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  const mergedFiles = React.useMemo(() => {
    if (!Object.keys(loadedChildren).length) return files;
    const attach = (nodes: FileNode[]): FileNode[] =>
      nodes.map((n) => {
        const ov = loadedChildren[n.id];
        const kids = ov ? ov.children : n.children;
        if (!kids || n.type !== "folder") return n;
        return { ...n, children: attach(kids) };
      });
    return attach(files);
  }, [files, loadedChildren]);
  const mergedRef = React.useRef<FileNode[]>([]);
  mergedRef.current = mergedFiles;

  const findNode = React.useCallback((nodes: FileNode[], id: string): FileNode | null => {
    for (const n of nodes) {
      if (n.id === id) return n;
      if (n.type === "folder" && n.children?.length) {
        const hit = findNode(n.children, id);
        if (hit) return hit;
      }
    }
    return null;
  }, []);

  const expandFolder = React.useCallback((folderId: string) => {
    const node = findNode(mergedRef.current, folderId);
    if (!node || node.type !== "folder") return;
    if ((node.children?.length || 0) > 0 || loadedRef.current[folderId]) {
      setExpandedFolders((prev) => (prev[folderId] ? prev : { ...prev, [folderId]: true }));
      return;
    }
    if (loadingRef.current.has(folderId) || !wsIdRef.current) return;
    loadingRef.current.add(folderId);
    loadDirectoryChildren(wsIdRef.current, node.path)
      .then((kids) => {
        loadingRef.current.delete(folderId);
        setLoadedChildren((prev) => ({ ...prev, [folderId]: { path: node.path, children: kids } }));
        setExpandedFolders((prev) => ({ ...prev, [folderId]: true }));
      })
      .catch(() => {
        loadingRef.current.delete(folderId);
      });
  }, [findNode]);

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

  const sortedFiles = React.useMemo(() => sortNodes(mergedFiles), [mergedFiles]);

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
