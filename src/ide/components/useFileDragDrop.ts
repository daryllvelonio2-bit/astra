import { useState, useRef, useCallback, useMemo } from "react";
import { PanResponder, PanResponderInstance } from "react-native";
import { FileNode } from "../types";

interface TargetBounds {
  id: string;
  top: number;
  bottom: number;
  left?: number;
  right?: number;
  node: FileNode;
}

interface UseFileDragDropProps {
  onMoveNode?: (source: FileNode, targetFolderNode: FileNode | null) => void;
  onExpandFolder: (folderId: string) => void;
  onCollapseFolder?: (folderId: string) => void;
  isFolderExpanded?: (folderId: string) => boolean;
}

/**
 * Universal drag-and-drop hook for FileExplorer.
 * Supports Web, Android, and iOS with proximity-based folder highlighting,
 * rapid auto-expansion for deep nested directories, and automatic auto-closing
 * of hover-opened folders when moving away from them and their subfolders.
 */
export function useFileDragDrop({
  onMoveNode,
  onExpandFolder,
  onCollapseFolder,
  isFolderExpanded,
}: UseFileDragDropProps) {
  const [draggingNode, setDraggingNode] = useState<FileNode | null>(null);
  const [hoveredTargetId, setHoveredTargetId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [containerOffset, setContainerOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const foldersMapRef = useRef<Map<string, TargetBounds>>(new Map());
  const folderRefsMap = useRef<Map<string, { ref: any; node: FileNode }>>(new Map());
  const rootDropRef = useRef<any>(null);
  const rootDropBoundsRef = useRef<{ top: number; bottom: number } | null>(null);
  const containerRef = useRef<any>(null);
  const containerOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const hoverTimerRef = useRef<any>(null);
  const hoveredTargetRef = useRef<string | null>(null);
  const draggingNodeRef = useRef<FileNode | null>(null);
  const autoOpenedFoldersRef = useRef<Set<string>>(new Set());

  // Stable callbacks for PanResponder
  const onExpandFolderRef = useRef(onExpandFolder);
  onExpandFolderRef.current = onExpandFolder;
  const onCollapseFolderRef = useRef(onCollapseFolder);
  onCollapseFolderRef.current = onCollapseFolder;
  const isFolderExpandedRef = useRef(isFolderExpanded);
  isFolderExpandedRef.current = isFolderExpanded;
  const onMoveNodeRef = useRef(onMoveNode);
  onMoveNodeRef.current = onMoveNode;

  /** Universal single element measurement helper (Web sync + Native async) */
  const measureRef = useCallback((ref: any, onMeasured: (top: number, bottom: number, left: number, right: number) => void) => {
    if (!ref) return;

    // 1. Web DOM (Sync & instant)
    if (typeof ref.getBoundingClientRect === "function") {
      try {
        const rect = ref.getBoundingClientRect();
        if (rect && rect.height > 0) {
          onMeasured(rect.top, rect.bottom, rect.left, rect.right);
          return;
        }
      } catch (_) {}
    }

    // 2. React Native (Android / iOS)
    if (typeof ref.measureInWindow === "function") {
      ref.measureInWindow((x: number, y: number, w: number, h: number) => {
        if (h > 0) {
          onMeasured(y, y + h, x, x + w);
        }
      });
      return;
    }

    // 3. Native fallback measure
    if (typeof ref.measure === "function") {
      ref.measure((_x: number, _y: number, w: number, h: number, pageX: number, pageY: number) => {
        if (h > 0) {
          onMeasured(pageY, pageY + h, pageX, pageX + w);
        }
      });
    }
  }, []);

  /** Measure single folder row and cache its bounding box */
  const measureSingleFolder = useCallback((id: string, ref: any, node: FileNode) => {
    measureRef(ref, (top, bottom, left, right) => {
      foldersMapRef.current.set(id, { id, top, bottom, left, right, node });
    });
  }, [measureRef]);

  /** Register folder header ref and measure immediately */
  const registerFolderHeaderRef = useCallback((id: string, ref: any, node: FileNode) => {
    if (ref) {
      folderRefsMap.current.set(id, { ref, node });
      measureSingleFolder(id, ref, node);
    } else {
      folderRefsMap.current.delete(id);
      foldersMapRef.current.delete(id);
    }
  }, [measureSingleFolder]);

  const registerRootDropRef = useCallback((ref: any) => {
    rootDropRef.current = ref;
    if (ref) {
      measureRef(ref, (top, bottom) => {
        rootDropBoundsRef.current = { top, bottom: bottom + 24 };
      });
    }
  }, [measureRef]);

  /** Re-measure all registered folders, container offset, and drop zones */
  const measureAllFolders = useCallback(() => {
    if (containerRef.current) {
      measureRef(containerRef.current, (top, _b, left) => {
        containerOffsetRef.current = { x: Math.max(0, left), y: Math.max(0, top) };
        setContainerOffset({ x: Math.max(0, left), y: Math.max(0, top) });
      });
    }

    folderRefsMap.current.forEach(({ ref, node }, id) => {
      measureSingleFolder(id, ref, node);
    });

    if (rootDropRef.current) {
      measureRef(rootDropRef.current, (top, bottom) => {
        rootDropBoundsRef.current = { top, bottom: bottom + 24 };
      });
    }
  }, [measureRef, measureSingleFolder]);

  /** Proximity & Hit-Testing: Finds the closest folder or workspace root under touch */
  const findTarget = useCallback((screenY: number): string | null => {
    const dragging = draggingNodeRef.current;
    if (!dragging) return null;

    // Check root drop zone first
    if (rootDropBoundsRef.current) {
      const r = rootDropBoundsRef.current;
      if (screenY >= r.top - 10 && screenY <= r.bottom + 10) {
        return "ROOT_WORKSPACE";
      }
    }

    const dragPath = dragging.path || dragging.name;
    let closestId: string | null = null;
    let minDistance = Infinity;

    for (const [id, entry] of foldersMapRef.current.entries()) {
      if (entry.node.id === dragging.id) continue;

      const entryPath = entry.node.path || entry.node.name;
      // Prevent dropping into itself or its own descendants
      if (entryPath === dragPath || entryPath.startsWith(`${dragPath}/`)) {
        continue;
      }

      const centerY = (entry.top + entry.bottom) / 2;
      const rowRadius = Math.max(16, (entry.bottom - entry.top) / 2 + 8); // 8px proximity zone

      const dist = Math.abs(screenY - centerY);
      if (dist <= rowRadius && dist < minDistance) {
        minDistance = dist;
        closestId = id;
      }
    }

    return closestId;
  }, []);

  const isActivelyMovingRef = useRef(false);

  /** Triggered on long press on any file or folder row */
  const startDrag = useCallback(
    (node: FileNode, x: number, y: number) => {
      isActivelyMovingRef.current = false;
      autoOpenedFoldersRef.current.clear();
      draggingNodeRef.current = node;
      setDraggingNode(node);
      setDragPos({ x, y });
      hoveredTargetRef.current = null;
      setHoveredTargetId(null);

      measureAllFolders();
      setTimeout(measureAllFolders, 30);
      setTimeout(measureAllFolders, 100);
      setTimeout(measureAllFolders, 200);
    },
    [measureAllFolders]
  );

  const cancelDrag = useCallback(() => {
    isActivelyMovingRef.current = false;
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }

    // Collapse all folders that were opened by hover during this drag
    if (autoOpenedFoldersRef.current.size > 0 && onCollapseFolderRef.current) {
      autoOpenedFoldersRef.current.forEach((id) => {
        onCollapseFolderRef.current?.(id);
      });
      autoOpenedFoldersRef.current.clear();
    }

    draggingNodeRef.current = null;
    hoveredTargetRef.current = null;
    setDraggingNode(null);
    setHoveredTargetId(null);
  }, []);

  const handlePressOut = useCallback(() => {
    // If long press was triggered but user releases finger in-place without moving, clean up
    setTimeout(() => {
      if (draggingNodeRef.current && !isActivelyMovingRef.current) {
        cancelDrag();
      }
    }, 180);
  }, [cancelDrag]);

  /**
   * Top-level PanResponder:
   * Captures drag gestures without interfering with child item taps.
   */
  const wrapperPanResponder = useMemo(
    (): PanResponderInstance =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,

        onMoveShouldSetPanResponder: () => !!draggingNodeRef.current,
        onMoveShouldSetPanResponderCapture: () => !!draggingNodeRef.current,

        onPanResponderGrant: () => {
          isActivelyMovingRef.current = true;
          measureAllFolders();
        },

        onPanResponderMove: (_e, g) => {
          if (!draggingNodeRef.current) return;
          isActivelyMovingRef.current = true;
          const sx = g.moveX;
          const sy = g.moveY;
          setDragPos({ x: sx, y: sy });

          const foundId = findTarget(sy);

          if (foundId !== hoveredTargetRef.current) {
            hoveredTargetRef.current = foundId;
            setHoveredTargetId(foundId);

            if (hoverTimerRef.current) {
              clearTimeout(hoverTimerRef.current);
              hoverTimerRef.current = null;
            }

            // Rapid auto-expand on folder hover (~180ms)
            if (foundId && foundId !== "ROOT_WORKSPACE") {
              const targetId = foundId;
              hoverTimerRef.current = setTimeout(() => {
                if (hoveredTargetRef.current === targetId) {
                  const wasOpen = isFolderExpandedRef.current ? isFolderExpandedRef.current(targetId) : false;
                  if (!wasOpen) {
                    autoOpenedFoldersRef.current.add(targetId);
                  }
                  onExpandFolderRef.current(targetId);
                  // Rapidly re-measure newly revealed nested child folders
                  setTimeout(measureAllFolders, 40);
                  setTimeout(measureAllFolders, 120);
                  setTimeout(measureAllFolders, 250);
                }
              }, 180);
            }

            // Auto-collapse hover-opened folders when moving away from them and their subfolders
            if (autoOpenedFoldersRef.current.size > 0 && onCollapseFolderRef.current) {
              const targetEntry = foundId && foundId !== "ROOT_WORKSPACE"
                ? foldersMapRef.current.get(foundId) || folderRefsMap.current.get(foundId)
                : null;
              const targetPath = targetEntry ? targetEntry.node.path || targetEntry.node.name : "";

              const toCollapse: string[] = [];
              autoOpenedFoldersRef.current.forEach((openedId) => {
                if (openedId === foundId) return; // Currently hovered

                const openedEntry = foldersMapRef.current.get(openedId) || folderRefsMap.current.get(openedId);
                const openedPath = openedEntry ? openedEntry.node.path || openedEntry.node.name : "";

                // If currently hovering inside a subfolder of opened folder, keep it open!
                const isHoveringInside = targetPath && openedPath && targetPath.startsWith(`${openedPath}/`);
                if (!isHoveringInside) {
                  toCollapse.push(openedId);
                }
              });

              if (toCollapse.length > 0) {
                toCollapse.forEach((id) => {
                  autoOpenedFoldersRef.current.delete(id);
                  onCollapseFolderRef.current?.(id);
                });
                setTimeout(measureAllFolders, 40);
                setTimeout(measureAllFolders, 120);
              }
            }
          }
        },

        onPanResponderRelease: () => {
          const source = draggingNodeRef.current;
          const targetId = hoveredTargetRef.current;
          const moveFn = onMoveNodeRef.current;

          if (source && targetId && moveFn) {
            if (targetId === "ROOT_WORKSPACE") {
              moveFn(source, null);
              // Close any hover-opened folders when dropped to root
              if (autoOpenedFoldersRef.current.size > 0 && onCollapseFolderRef.current) {
                autoOpenedFoldersRef.current.forEach((id) => {
                  onCollapseFolderRef.current?.(id);
                });
                autoOpenedFoldersRef.current.clear();
              }
            } else {
              const entry = foldersMapRef.current.get(targetId) || folderRefsMap.current.get(targetId);
              if (entry && entry.node.id !== source.id) {
                moveFn(source, entry.node);

                // Keep target folder & its ancestors open, close any other unrelated hover-opened folders
                const dropPath = entry.node.path || entry.node.name;
                if (autoOpenedFoldersRef.current.size > 0 && onCollapseFolderRef.current) {
                  const toCollapse: string[] = [];
                  autoOpenedFoldersRef.current.forEach((openedId) => {
                    if (openedId === targetId) return;
                    const openedEntry = foldersMapRef.current.get(openedId) || folderRefsMap.current.get(openedId);
                    const openedPath = openedEntry ? openedEntry.node.path || openedEntry.node.name : "";
                    const isAncestor = dropPath && openedPath && dropPath.startsWith(`${openedPath}/`);
                    if (!isAncestor) {
                      toCollapse.push(openedId);
                    }
                  });
                  toCollapse.forEach((id) => {
                    autoOpenedFoldersRef.current.delete(id);
                    onCollapseFolderRef.current?.(id);
                  });
                }
              }
            }
          } else {
            // Dropped outside -> close all hover-opened folders
            if (autoOpenedFoldersRef.current.size > 0 && onCollapseFolderRef.current) {
              autoOpenedFoldersRef.current.forEach((id) => {
                onCollapseFolderRef.current?.(id);
              });
              autoOpenedFoldersRef.current.clear();
            }
          }

          if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
          }
          isActivelyMovingRef.current = false;
          autoOpenedFoldersRef.current.clear();
          draggingNodeRef.current = null;
          hoveredTargetRef.current = null;
          setDraggingNode(null);
          setHoveredTargetId(null);
        },

        onPanResponderTerminate: () => {
          isActivelyMovingRef.current = false;
          cancelDrag();
        },
      }),
    [findTarget, measureAllFolders, cancelDrag]
  );

  return {
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
  };
}

