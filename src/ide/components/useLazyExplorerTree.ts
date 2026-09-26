import React from "react";
import { FileNode } from "../types";
import { loadDirectoryChildren, reuseUnchangedNodes } from "../services/workspaceTreeService";

type ExpandedMap = Record<string, boolean>;
type OverlayMap = Record<string, { path: string; children: FileNode[] }>;

interface LazyTree {
  mergedFiles: FileNode[];
  expandFolder: (folderId: string) => void;
  clearExpansion: () => void;
}

/**
 * Lazy explorer tree: a shallow base plus on-demand overlays for expanded
 * folders. Owns the overlay cache, identity-stable merging, refresh
 * re-fetching, and fetch-on-expand — extracted from FileExplorer to hold
 * the 500-line file cap.
 */
export function useLazyExplorerTree(
  workspaceId: string,
  files: FileNode[],
  expandedFoldersRef: React.MutableRefObject<ExpandedMap>,
  setExpandedFolders: React.Dispatch<React.SetStateAction<ExpandedMap>>
): LazyTree {
  const [loadedChildren, setLoadedChildren] = React.useState<OverlayMap>({});
  const loadedRef = React.useRef<OverlayMap>({});
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
  }, [workspaceId, setExpandedFolders]);

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

  // Identity-stable base: reloads build fresh objects; reusing the
  // previous ones for unchanged nodes keeps memo'd rows from re-rendering.
  const prevFilesRef = React.useRef<FileNode[]>([]);
  const stableFiles = React.useMemo(() => {
    const stable = reuseUnchangedNodes(prevFilesRef.current, files);
    prevFilesRef.current = stable;
    return stable;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  const mergedFiles = React.useMemo(() => {
    if (!Object.keys(loadedChildren).length) return stableFiles;
    // Only clone branches that actually contain a loaded overlay (path
    // prefix check) — untouched branches keep their refs, rows memo hold.
    const overlayPaths = Object.values(loadedChildren).map((e) => e.path);
    const attach = (nodes: FileNode[]): FileNode[] =>
      nodes.map((n) => {
        if (n.type !== "folder") return n;
        const ov = loadedChildren[n.id];
        if (ov) return { ...n, children: attach(ov.children) };
        const kids = n.children;
        if (!kids?.length) return n;
        const prefix = n.path ? `${n.path}/` : "";
        const under = overlayPaths.some((p) => p !== n.path && p.startsWith(prefix));
        if (!under) return n;
        return { ...n, children: attach(kids) };
      });
    return attach(stableFiles);
  }, [stableFiles, loadedChildren]);
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
  }, [findNode, setExpandedFolders]);

  const clearExpansion = React.useCallback(() => {
    setLoadedChildren({});
    loadedRef.current = {};
    setExpandedFolders({});
  }, [setExpandedFolders]);

  return { mergedFiles, expandFolder, clearExpansion };
}
