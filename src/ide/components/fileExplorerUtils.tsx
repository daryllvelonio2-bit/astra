import React from 'react';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { SvgXml } from 'react-native-svg';
import { FileNode } from '../types';
import { getActiveIconThemeSvg } from '../services/extensions/iconThemeService';

export const FILE_ICONS: Record<string, { icon: any; color: string }> = {
  ts: { icon: "language-typescript", color: "#3178c6" },
  tsx: { icon: "language-typescript", color: "#3178c6" },
  js: { icon: "language-javascript", color: "#f7df1e" },
  jsx: { icon: "language-javascript", color: "#f7df1e" },
  json: { icon: "code-json", color: "#cbcb41" },
  md: { icon: "language-markdown", color: "#519aba" },
  py: { icon: "language-python", color: "#3572A5" },
  php: { icon: "language-php", color: "#777bb4" },
  html: { icon: "language-html5", color: "#e34c26" },
  css: { icon: "language-html5", color: "#e34c26" },
  java: { icon: "language-java", color: "#ea2d2e" },
  kt: { icon: "language-kotlin", color: "#7f52ff" },
  kts: { icon: "language-kotlin", color: "#7f52ff" },
  c: { icon: "language-c", color: "#a8b9cc" },
  cpp: { icon: "language-cpp", color: "#00599c" },
  cc: { icon: "language-cpp", color: "#00599c" },
  cxx: { icon: "language-cpp", color: "#00599c" },
  h: { icon: "language-c", color: "#a8b9cc" },
  hpp: { icon: "language-cpp", color: "#00599c" },
  go: { icon: "language-go", color: "#00add8" },
  rs: { icon: "language-rust", color: "#dea584" },
  sql: { icon: "database", color: "#e38c00" },
  sh: { icon: "bash", color: "#89e051" },
  bash: { icon: "bash", color: "#89e051" },
  zsh: { icon: "bash", color: "#89e051" },
  yml: { icon: "code-json", color: "#cb171e" },
  yaml: { icon: "code-json", color: "#cb171e" },
  rb: { icon: "language-ruby", color: "#cc342d" },
  swift: { icon: "language-swift", color: "#f05138" },
  dart: { icon: "code-tags", color: "#00b4ab" },
  xml: { icon: "xml", color: "#e34c26" },
  svg: { icon: "svg", color: "#ffb13b" },
};

export function getFileIcon(fileName: string, isFolder = false, isExpanded = false) {
  const svg = getActiveIconThemeSvg(fileName, isFolder, isExpanded);
  if (svg) {
    return <SvgXml xml={svg} width={16} height={16} />;
  }

  if (isFolder) {
    return <Ionicons name={isExpanded ? "folder-open" : "folder"} size={16} color="#dcb67a" />;
  }

  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const item = FILE_ICONS[ext];
  if (item) return <MaterialCommunityIcons name={item.icon} size={16} color={item.color} />;
  return <Ionicons name="document-text-outline" size={16} color="#9cdcfe" />;
}

export function sortNodes(nodes: FileNode[]): FileNode[] {
  if (!nodes) return [];
  const sorted = [...nodes].sort((a, b) => {
    const aIsFolder = a.type === 'folder';
    const bIsFolder = b.type === 'folder';
    if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;

    const aIsDot = a.name.startsWith('.');
    const bIsDot = b.name.startsWith('.');
    if (aIsDot !== bIsDot) return aIsDot ? 1 : -1;

    return a.name.localeCompare(b.name, undefined, { sensitivity: 'accent', numeric: true });
  });

  return sorted.map((node) => ({
    ...node,
    children: node.children ? sortNodes(node.children) : undefined,
  }));
}

/** Recursively updates path and id for a node and all its descendants */
export function updateNodePaths(node: FileNode, newParentPath: string, workspaceId: string): FileNode {
  const newPath = newParentPath ? `${newParentPath}/${node.name}` : node.name;
  const newId = `${workspaceId}-${newPath.replace(/\//g, "-")}`;
  return {
    ...node,
    path: newPath,
    id: newId,
    children: node.children
      ? node.children.map((child) => updateNodePaths(child, newPath, workspaceId))
      : undefined,
  };
}

/** Recursively relocates a node (file or folder) within the FileNode tree */
export function moveNodeInTree(
  root: FileNode,
  sourceId: string,
  targetFolderId: string | null,
  workspaceId: string
): FileNode {
  let movedNode: FileNode | null = null;

  function removeSource(node: FileNode): FileNode {
    if (!node.children) return node;
    const filtered: FileNode[] = [];
    for (const child of node.children) {
      if (child.id === sourceId) {
        movedNode = child;
      } else {
        filtered.push(removeSource(child));
      }
    }
    return { ...node, children: filtered };
  }

  const cleanedRoot = removeSource(root);
  if (!movedNode) return root;

  // Move to workspace root
  if (!targetFolderId || targetFolderId === "ROOT_WORKSPACE" || targetFolderId === `${workspaceId}-root`) {
    const updatedMoved = updateNodePaths(movedNode, "", workspaceId);
    return {
      ...cleanedRoot,
      children: [...(cleanedRoot.children || []), updatedMoved],
    };
  }

  // Move into target folder
  function insertIntoTarget(node: FileNode): FileNode {
    if (node.id === targetFolderId) {
      const folderPath = node.path || node.name;
      const updatedMoved = updateNodePaths(movedNode!, folderPath, workspaceId);
      return {
        ...node,
        children: [...(node.children || []), updatedMoved],
      };
    }
    if (!node.children) return node;
    return {
      ...node,
      children: node.children.map(insertIntoTarget),
    };
  }

  return insertIntoTarget(cleanedRoot);
}
