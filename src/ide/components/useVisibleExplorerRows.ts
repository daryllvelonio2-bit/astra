import { useMemo } from "react";
import { FileNode } from "../types";

/** A single visible explorer row: a node plus its indent depth. */
export interface VisibleExplorerRow {
  node: FileNode;
  depth: number;
}

/**
 * Flattens the sorted tree into the visible row list (expanded folders
 * inline their children). Identity is stable unless the tree or the
 * expansion map changes — the memo backbone that lets rows skip
 * re-renders during sidebar resizes.
 */
export function useVisibleExplorerRows(
  sortedFiles: FileNode[],
  expandedFolders: Record<string, boolean>
): VisibleExplorerRow[] {
  return useMemo(() => {
    const rows: VisibleExplorerRow[] = [];
    const walk = (nodes: FileNode[], depth: number) => {
      for (const node of nodes) {
        rows.push({ node, depth });
        if (node.type === "folder" && expandedFolders[node.id] && node.children) {
          walk(node.children, depth + 1);
        }
      }
    };
    walk(sortedFiles, 0);
    return rows;
  }, [sortedFiles, expandedFolders]);
}
