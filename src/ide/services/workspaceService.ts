import * as FileSystem from "expo-file-system/legacy";
import { FileNode } from "../types";
import { PRootService } from "./prootService";
import {
  readDir,
  readDirEntries,
  getFileInfo,
  readFileText,
  writeFileText,
  makeDir,
  deletePath,
  movePath,
} from "./nativeFs";

const WORKSPACES_DIR = `${FileSystem.documentDirectory}workspaces/`;
const REGISTRY_FILE = `${FileSystem.documentDirectory}workspaces_registry.json`;

// Canonical ignore list now lives in workspaceIgnore (a pure module, so the
// walk that consumes it stays headlessly testable). Re-exported under the old
// name so workspaceTreeService and fileTreeWalker need no change.
export { IGNORED_FOLDERS } from "./workspaceIgnore";
import { IGNORED_FOLDERS } from "./workspaceIgnore";
// The lazy tree loader lives in workspaceTreeService, which imports from this
// module — so this is a cycle. It is benign: both modules only DEFINE hoisted
// functions and call each other at runtime, never while a module initialises.
import { loadWorkspaceShallow } from "./workspaceTreeService";

export interface WorkspaceMeta {
  id: string;
  name: string;
  dirPath?: string;
  template?: string;
  createdAt: number;
}

export interface Workspace {
  id: string;
  name: string;
  root: FileNode;
  dirPath?: string;
}

type WorkspaceChangeListener = (workspaceId: string) => void;
const changeListeners = new Set<WorkspaceChangeListener>();

export function subscribeWorkspaceChanges(listener: WorkspaceChangeListener): () => void {
  changeListeners.add(listener);
  return () => { changeListeners.delete(listener); };
}

export function notifyWorkspaceChanged(workspaceId: string) {
  changeListeners.forEach((l) => {
    try { l(workspaceId); } catch (_) {}
  });
}

export async function ensureWorkspacesDir() {
  try { await makeDir(WORKSPACES_DIR); } catch (e) { console.error("Error ensuring workspaces dir:", e); }
}

export async function loadWorkspaceRegistry(): Promise<Record<string, WorkspaceMeta>> {
  try {
    const text = await readFileText(REGISTRY_FILE);
    if (text) return JSON.parse(text) || {};
  } catch (_) {}
  return {};
}

let _wsWriteQueue = Promise.resolve();

export async function saveWorkspaceMeta(meta: WorkspaceMeta): Promise<void> {
  _wsWriteQueue = _wsWriteQueue.then(async () => {
    try {
      const registry = await loadWorkspaceRegistry();
      registry[meta.id] = meta;
      await writeFileText(REGISTRY_FILE, JSON.stringify(registry, null, 2));
    } catch (_) {}
  });
  return _wsWriteQueue;
}

export async function getWorkspaceDirPath(workspaceId: string): Promise<string> {
  const registry = await loadWorkspaceRegistry();
  if (registry[workspaceId]?.dirPath) {
    const p = registry[workspaceId].dirPath!;
    return p.endsWith("/") ? p : `${p}/`;
  }
  return `${WORKSPACES_DIR}${workspaceId}/`;
}

export async function listWorkspaces(): Promise<string[]> {
  await ensureWorkspacesDir();
  const idSet = new Set<string>();
  try { (await readDir(WORKSPACES_DIR)).forEach((d) => { if (!d.includes("-deleting-") && !d.startsWith(".")) idSet.add(d); }); } catch (_) {}
  try { Object.keys(await loadWorkspaceRegistry()).forEach((id) => idSet.add(id)); } catch (_) {}
  return Array.from(idSet);
}

export async function listWorkspaceMetas(): Promise<WorkspaceMeta[]> {
  const ids = await listWorkspaces();
  const registry = await loadWorkspaceRegistry();
  const metas = ids.map((id) => registry[id] || {
    id,
    name: id,
    dirPath: `${WORKSPACES_DIR}${id}/`,
    createdAt: Date.now(),
  });
  // One project, one card. listWorkspaces() unions the directories on disk with
  // the registry keys, so a project whose folder name is not already a slug
  // ("Teachers-Day" on disk vs "teachers-day" in the registry) comes back from
  // BOTH sources and was rendered TWICE in the picker. Collapse by directory,
  // keeping the registry entry when there is one — it carries the real name.
  const byDir = new Map<string, WorkspaceMeta>();
  for (const meta of metas) {
    const key = (meta.dirPath || meta.id).replace(/\/+$/, "");
    const prev = byDir.get(key);
    const metaRegistered = !!registry[meta.id];
    const prevRegistered = prev ? !!registry[prev.id] : false;
    if (!prev || (metaRegistered && !prevRegistered)) byDir.set(key, meta);
  }
  return Array.from(byDir.values());
}

export function normalizeCleanPath(p: string): string {
  if (!p) return "";
  let clean = p.trim().replace(/^file:\/\//, "").replace(/\/+/g, "/");
  try {
    clean = decodeURIComponent(clean);
  } catch (_) {}
  if (clean.startsWith("/sdcard/")) {
    clean = "/storage/emulated/0/" + clean.slice(8);
  } else if (clean === "/sdcard") {
    clean = "/storage/emulated/0";
  }
  return clean;
}

export function resolveFullPath(baseDir: string, filePath: string): string {
  let clean = normalizeCleanPath(filePath);
  if (clean.startsWith("storage/") || clean.startsWith("sdcard/") || clean.startsWith("data/")) {
    clean = "/" + clean;
  }
  if (
    clean.startsWith("/") &&
    (clean.startsWith(baseDir) ||
      clean.startsWith("/sdcard") ||
      clean.startsWith("/storage") ||
      clean.startsWith("/data"))
  ) {
    return clean;
  }
  return `${baseDir}/${clean.replace(/^\/+/, "")}`;
}

export async function readFileContent(workspaceId: string, filePath: string): Promise<string> {
  try {
    const rawBaseDir = await getWorkspaceDirPath(workspaceId);
    const baseDir = normalizeCleanPath(rawBaseDir).replace(/\/+$/, "");
    const targetFullPath = resolveFullPath(baseDir, filePath);
    return await readFileText(targetFullPath);
  } catch (_) {}
  return "";
}

export type WorkspaceLoadProgress = (dirsScanned: number, currentPath: string) => void;

/**
 * NOTE: there is deliberately NO deep-scan loader in this file any more.
 * `loadWorkspace` and its recursive walk were removed after they turned out to
 * be dead weight on the project-open path: they walked the WHOLE tree (wrapped
 * in a 45s timeout) and every caller discarded the result, because the IDE
 * renders from the lazy `loadWorkspaceShallow` in workspaceTreeService. A full
 * scan here is what made large projects look like the app could not open them —
 * do not reintroduce one.
 */

export async function loadOrCreateDefaultWorkspace(): Promise<Workspace> {
  try {
    await ensureWorkspacesDir();
    const dirs = await listWorkspaces();
    if (dirs?.length) return await loadWorkspaceShallow(dirs[0]);
  } catch (_) {}
  return await createWorkspace("MyFirstProject");
}

export async function createWorkspace(
  name: string,
  customPath?: string
): Promise<Workspace> {
  await ensureWorkspacesDir();
  const folderName = name.trim().replace(/[\/\\]/g, "-");
  const workspaceId = name.toLowerCase().replace(/[^a-z0-9_-]/g, "-");

  let targetDir: string;
  if (customPath && customPath.trim().length > 0) {
    const clean = customPath.trim().replace(/^file:\/\//, "").replace(/\/+$/, "");
    const lastSegment = clean.split("/").filter(Boolean).pop() || "";
    if (lastSegment.toLowerCase() === folderName.toLowerCase() || lastSegment.toLowerCase() === workspaceId) {
      targetDir = `${clean}/`;
    } else {
      targetDir = `${clean}/${folderName}/`;
    }
  } else {
    targetDir = `${WORKSPACES_DIR}${workspaceId}/`;
  }

  await saveWorkspaceMeta({
    id: workspaceId,
    name,
    dirPath: targetDir,
    createdAt: Date.now(),
  });

  try {
    await makeDir(targetDir);
  } catch (e) {}

  notifyWorkspaceChanged(workspaceId);
  return await loadWorkspaceShallow(workspaceId);
}

export async function openExistingDirectoryAsProject(
  dirPath: string,
  customName?: string
): Promise<Workspace> {
  await ensureWorkspacesDir();
  const cleanPath = dirPath.trim().replace(/^file:\/\//, "");
  const normalizedPath = cleanPath.endsWith("/") ? cleanPath : `${cleanPath}/`;

  const folderName = normalizedPath.split("/").filter(Boolean).pop() || "project";
  const name = customName?.trim() || folderName;
  const slug = name.toLowerCase().replace(/[^a-z0-9_-]/g, "-");

  // Reuse the id of a workspace that already points at this directory.
  // Minting a fresh slug here is how ONE project ended up listed TWICE: the
  // folder on disk keeps its original case ("Teachers-Day") while the registry
  // key is the slug ("teachers-day"), and listWorkspaces() unions both sources.
  const registry = await loadWorkspaceRegistry();
  const existingId = Object.keys(registry).find(
    (id) => (registry[id]?.dirPath || "").replace(/\/+$/, "") === normalizedPath.replace(/\/+$/, "")
  );
  const workspaceId = existingId || slug;

  await saveWorkspaceMeta({
    id: workspaceId,
    name,
    dirPath: normalizedPath,
    createdAt: Date.now(),
  });

  notifyWorkspaceChanged(workspaceId);
  return await loadWorkspaceShallow(workspaceId);
}

export async function saveFileContent(workspaceId: string, filePath: string, content: string): Promise<void> {
  try {
    const rawBaseDir = await getWorkspaceDirPath(workspaceId);
    const baseDir = normalizeCleanPath(rawBaseDir).replace(/\/+$/, "");
    const targetFullPath = resolveFullPath(baseDir, filePath);
    await writeFileText(targetFullPath, content);
    notifyWorkspaceChanged(workspaceId);
  } catch (_) {}
}

export async function createFileInWorkspace(workspaceId: string, fileName: string, content = ""): Promise<FileNode> {
  await saveFileContent(workspaceId, fileName, content);
  const cleanPath = fileName.replace(/^\/+/, "");
  return {
    id: `${workspaceId}::${cleanPath}`,
    name: cleanPath.split("/").pop() || cleanPath,
    type: "file",
    path: cleanPath,
    content,
  };
}

export async function deleteFileFromWorkspace(workspaceId: string, filePath: string): Promise<void> {
  try {
    const rawBaseDir = await getWorkspaceDirPath(workspaceId);
    const baseDir = normalizeCleanPath(rawBaseDir).replace(/\/+$/, "");
    const targetFullPath = resolveFullPath(baseDir, filePath);
    await deletePath(targetFullPath);
    notifyWorkspaceChanged(workspaceId);
  } catch (_) {}
}

export async function deleteNodeInWorkspace(workspaceId: string, nodeOrPath: string | FileNode): Promise<void> {
  let path = typeof nodeOrPath === "string" ? nodeOrPath : (nodeOrPath.path || nodeOrPath.name);
  if (path.startsWith(`${workspaceId}::`)) {
    path = path.slice(workspaceId.length + 2);
  } else if (path.startsWith(`${workspaceId}-`)) {
    path = path.slice(workspaceId.length + 1);
  }
  path = path.replace(/^\/+/, "");
  await deleteFileFromWorkspace(workspaceId, path);
}

export async function renameNodeInWorkspace(
  workspaceId: string,
  oldNodeOrPath: string | FileNode,
  newName: string
): Promise<void> {
  let oldPath = typeof oldNodeOrPath === "string" ? oldNodeOrPath : (oldNodeOrPath.path || oldNodeOrPath.name);
  if (oldPath.startsWith(`${workspaceId}::`)) {
    oldPath = oldPath.slice(workspaceId.length + 2);
  } else if (oldPath.startsWith(`${workspaceId}-`)) {
    oldPath = oldPath.slice(workspaceId.length + 1);
  }
  const cleanOld = normalizeCleanPath(oldPath).replace(/^\/+/, "");
  const parentDir = cleanOld.includes("/") ? cleanOld.substring(0, cleanOld.lastIndexOf("/")) : "";
  const cleanNew = parentDir ? `${parentDir}/${newName}` : newName;

  try {
    const rawBaseDir = await getWorkspaceDirPath(workspaceId);
    const baseDir = normalizeCleanPath(rawBaseDir).replace(/\/+$/, "");
    const fullOld = cleanOld.startsWith("/") ? cleanOld : `${baseDir}/${cleanOld}`;
    const fullNew = `${baseDir}/${cleanNew}`;
    await movePath(fullOld, fullNew);
    notifyWorkspaceChanged(workspaceId);
  } catch (_) {}
}

export async function moveNodeInWorkspace(
  workspaceId: string,
  sourceNodeIdOrPath: string | FileNode,
  targetFolderNodeIdOrPath: string | FileNode | null
): Promise<void> {
  let sourcePath = typeof sourceNodeIdOrPath === "string" ? sourceNodeIdOrPath : (sourceNodeIdOrPath.path || sourceNodeIdOrPath.name);
  if (sourcePath.startsWith(`${workspaceId}::`)) {
    sourcePath = sourcePath.slice(workspaceId.length + 2);
  } else if (sourcePath.startsWith(`${workspaceId}-`)) {
    sourcePath = sourcePath.slice(workspaceId.length + 1);
  }
  sourcePath = normalizeCleanPath(sourcePath).replace(/^\/+/, "");

  let targetFolder = "";
  if (targetFolderNodeIdOrPath) {
    targetFolder = typeof targetFolderNodeIdOrPath === "string" ? targetFolderNodeIdOrPath : (targetFolderNodeIdOrPath.path || targetFolderNodeIdOrPath.name);
    if (targetFolder.startsWith(`${workspaceId}::`)) {
      targetFolder = targetFolder.slice(workspaceId.length + 2);
    } else if (targetFolder.startsWith(`${workspaceId}-`)) {
      targetFolder = targetFolder.slice(workspaceId.length + 1);
    }
    if (targetFolder === "root" || targetFolder.endsWith("::root")) {
      targetFolder = "";
    }
    targetFolder = normalizeCleanPath(targetFolder).replace(/^\/+/, "");
  }

  const fileName = sourcePath.split("/").pop() || sourcePath;
  const newPath = targetFolder ? `${targetFolder}/${fileName}` : fileName;

  if (sourcePath === newPath) return;

  try {
    const rawBaseDir = await getWorkspaceDirPath(workspaceId);
    const baseDir = normalizeCleanPath(rawBaseDir).replace(/\/+$/, "");
    const fullSource = sourcePath.startsWith("/") ? sourcePath : `${baseDir}/${sourcePath}`;
    const fullTarget = newPath.startsWith("/") ? newPath : `${baseDir}/${newPath}`;
    await movePath(fullSource, fullTarget);
    notifyWorkspaceChanged(workspaceId);
  } catch (e) {
    console.error("Error moving node in workspace:", e);
  }
}

/** Serializes workspace deletions so two deletes can't race on one dir. */
let _wsDeleteQueue = Promise.resolve();

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  _wsDeleteQueue = _wsDeleteQueue.then(() => deleteWorkspaceInner(workspaceId));
  return _wsDeleteQueue;
}

async function deleteWorkspaceInner(workspaceId: string): Promise<void> {
  const workspacePath = await getWorkspaceDirPath(workspaceId);
  // 1. Remove registry first so list reloads instantly.
  try {
    const registry = await loadWorkspaceRegistry();
    if (registry[workspaceId]) {
      delete registry[workspaceId];
      await writeFileText(REGISTRY_FILE, JSON.stringify(registry, null, 2));
    }
  } catch (_) {}
  // 2. Instant O(1) rename (no trailing slashes — they make moveAsync
  // create the dest dir first, which then fails the move into it), then
  // slow recursive delete in background. The list skips -deleting- dirs.
  const clean = normalizeCleanPath(workspacePath).replace(/\/+$/, "");
  const trash = `${clean}-deleting-${Date.now()}`;
  try {
    const renamed = await movePath(clean, trash);
    if (renamed) {
      const sweep = async () => {
        if (await deletePath(trash)) return true;
        await new Promise<void>((r) => setTimeout(r, 2000));
        return deletePath(trash);
      };
      sweep().catch(() => {});
      return;
    }
  } catch (_) {}
  // 3. Rename failed: delete in place, awaited with retries — verify gone
  // so the UI can report failure instead of silently resurrecting the entry.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await deletePath(workspacePath);
    } catch (_) {}
    try {
      const info = await getFileInfo(workspacePath);
      if (!info || !info.exists) break;
    } catch (_) {
      break;
    }
    await new Promise<void>((r) => setTimeout(r, 2000));
  }
  try {
    const info = await getFileInfo(workspacePath);
    if (info && info.exists) throw new Error(`Could not delete workspace dir: ${workspacePath}`);
  } catch (e: any) {
    if (e?.message?.startsWith("Could not delete")) throw e;
  }
  // 4. Tiny conversation file + notify (fast).
  try {
    const safeId = (workspaceId || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
    await deletePath(`${FileSystem.documentDirectory}conversations/${safeId}.json`);
  } catch (_) {}
  notifyWorkspaceChanged(workspaceId);
}
