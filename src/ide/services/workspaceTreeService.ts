import { FileNode } from "../types";
import {
  ensureWorkspacesDir,
  getWorkspaceDirPath,
  normalizeCleanPath,
  IGNORED_FOLDERS,
  Workspace,
  WorkspaceLoadProgress,
} from "./workspaceService";
import { readDirEntries, makeDir } from "./nativeFs";

/**
 * Lazy tree loading for huge projects: open reads the root plus one level
 * (bounded native calls, no deep recursion), deeper folders load on expand
 * via loadDirectoryChildren. Same visibility rules as the full scan.
 */

function isVisibleEntry(name: string): boolean {
  if (IGNORED_FOLDERS.has(name)) return false;
  if (name.startsWith(".") && name !== ".env" && name !== ".gitignore" && name !== ".env.example") return false;
  return true;
}

function toFileNode(
  workspaceId: string,
  baseDir: string,
  fullPath: string,
  name: string,
  isDirectory: boolean,
  children?: FileNode[]
): FileNode {
  const relativePath = fullPath.startsWith(baseDir)
    ? fullPath.slice(baseDir.length).replace(/^\/+/, "")
    : fullPath.replace(/^\/+/, "");
  return {
    id: `${workspaceId}::${relativePath}`,
    name,
    type: isDirectory ? "folder" : "file",
    path: relativePath,
    ...(isDirectory ? { children: children || [] } : { content: "" }),
  };
}

/** Root plus one level: open cost is (#topDirs + 1) listings, never a deep walk. */
export async function loadWorkspaceShallow(
  workspaceId: string,
  onProgress?: WorkspaceLoadProgress
): Promise<Workspace> {
  await ensureWorkspacesDir();
  const workspacePath = await getWorkspaceDirPath(workspaceId);
  await makeDir(workspacePath);

  const cleanBaseDir = normalizeCleanPath(workspacePath).replace(/\/+$/, "");
  const yieldTick = () => new Promise<void>((r) => setTimeout(r, 0));
  let dirs = 0;

  const listOne = async (dirPath: string, depth: number): Promise<FileNode[]> => {
    const cleanDir = normalizeCleanPath(dirPath).replace(/\/+$/, "");
    let entries;
    try {
      entries = await readDirEntries(cleanDir);
    } catch (_) {
      return [];
    }
    if (++dirs % 8 === 0) await yieldTick();
    try { onProgress?.(dirs, cleanDir); } catch (_) {}
    const out: FileNode[] = [];
    for (const entry of entries) {
      if (!isVisibleEntry(entry.name)) continue;
      const full = normalizeCleanPath(entry.path);
      if (!entry.isDirectory) {
        out.push(toFileNode(workspaceId, cleanBaseDir, full, entry.name, false));
      } else if (depth < 1) {
        out.push(toFileNode(workspaceId, cleanBaseDir, full, entry.name, true, await listOne(`${full}/`, depth + 1)));
      } else {
        out.push(toFileNode(workspaceId, cleanBaseDir, full, entry.name, true, []));
      }
    }
    return out;
  };

  const children = await listOne(`${cleanBaseDir}/`, 0);
  const folderName = cleanBaseDir.split("/").filter(Boolean).pop() || workspaceId;
  return {
    id: workspaceId,
    name: workspaceId,
    root: { id: `${workspaceId}::root`, name: folderName, type: "folder", path: "", children },
    dirPath: workspacePath,
  };
}

/** Single-level listing for expand-on-demand. Throws nothing — [] on error. */
export async function loadDirectoryChildren(
  workspaceId: string,
  relDirPath: string
): Promise<FileNode[]> {
  try {
    const rawBaseDir = await getWorkspaceDirPath(workspaceId);
    const baseDir = normalizeCleanPath(rawBaseDir).replace(/\/+$/, "");
    const rel = normalizeCleanPath(relDirPath || "").replace(/^\/+/, "");
    const full = rel ? `${baseDir}/${rel}` : baseDir;
    const entries = await readDirEntries(full);
    const out: FileNode[] = [];
    for (const entry of entries) {
      if (!isVisibleEntry(entry.name)) continue;
      out.push(
        toFileNode(workspaceId, baseDir, normalizeCleanPath(entry.path), entry.name, entry.isDirectory, entry.isDirectory ? [] : undefined)
      );
    }
    return out;
  } catch (_) {
    return [];
  }
}
