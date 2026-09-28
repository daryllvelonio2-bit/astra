import * as FileSystem from "expo-file-system/legacy";
import { getFileInfo, makeDir, deletePath } from "./nativeFs";
import { listTree } from "./fileTreeWalker";
import {
  getWorkspaceDirPath,
  normalizeCleanPath,
  resolveFullPath,
  notifyWorkspaceChanged,
} from "./workspaceService";

/**
 * Import phone-storage files/folders INTO a workspace by copying them.
 * The source is never moved or deleted.
 */

export type ImportConflictPolicy = "overwrite" | "rename" | "skip";

export interface ImportProgress {
  done: number;
  total: number;
  current: string;
}

export interface ImportOutcome {
  copied: number;
  failed: number;
  /** Path (workspace-relative) the entry landed at. */
  targetRelative: string;
  /** True when the conflict policy skipped an existing target. */
  skipped: boolean;
}

export interface ImportEntryOptions {
  workspaceId: string;
  /** Absolute path of the file/folder on the phone. */
  sourcePath: string;
  /** Workspace-relative folder to import into ("" = workspace root). */
  destRelativeDir?: string;
  policy?: ImportConflictPolicy;
  onProgress?: (progress: ImportProgress) => void;
}

/** Refuse absurd folder imports rather than freezing the UI for minutes. */
export const MAX_IMPORT_FILES = 5000;

/** Storage volumes we must never import wholesale. */
const STORAGE_ROOTS = new Set([
  "/", "/sdcard", "/storage", "/storage/emulated", "/storage/emulated/0",
  "/mnt", "/data", "/system", "/emulated",
]);

/** True for a path that points at a whole storage volume, not a user folder. */
export function isStorageRoot(path: string): boolean {
  const clean = normalizeCleanPath(path).replace(/\/+$/, "");
  return clean === "" || STORAGE_ROOTS.has(clean);
}

/**
 * Expo's FileSystem treats the path literally while the Kotlin layer maps
 * /sdcard -> /storage/emulated/0, so normalize before handing it a URI.
 */
const toUri = (p: string) => `file://${normalizeCleanPath(p.replace(/^file:\/\//, ""))}`;
const cleanRelative = (p: string) => (p || "").replace(/^\/+/, "").replace(/\/+$/, "");
const basenameOf = (p: string) => p.replace(/\/+$/, "").split("/").filter(Boolean).pop() || "";

async function workspaceBaseDir(workspaceId: string): Promise<string> {
  const raw = await getWorkspaceDirPath(workspaceId);
  return normalizeCleanPath(raw).replace(/\/+$/, "");
}

/** Absolute on-disk path of a workspace-relative path. */
export async function workspaceAbsolutePath(
  workspaceId: string,
  relative: string
): Promise<string> {
  return resolveFullPath(await workspaceBaseDir(workspaceId), cleanRelative(relative));
}

/** Does a workspace-relative path already exist on disk? */
export async function targetExists(workspaceId: string, relative: string): Promise<boolean> {
  try {
    const info = await getFileInfo(await workspaceAbsolutePath(workspaceId, relative));
    return !!info.exists;
  } catch (_) {
    return false;
  }
}

/** `report.pdf` + 2 -> `report-2.pdf` */
function suffixed(name: string, n: number): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return `${name}-${n}`;
  return `${name.slice(0, dot)}-${n}${name.slice(dot)}`;
}

function replaceBasename(relative: string, newName: string): string {
  const idx = relative.lastIndexOf("/");
  return idx === -1 ? newName : `${relative.slice(0, idx + 1)}${newName}`;
}

/** First free `name`, `name-2`, `name-3`… inside the workspace. */
export async function uniqueRelativePath(
  workspaceId: string,
  relative: string
): Promise<string> {
  if (!(await targetExists(workspaceId, relative))) return relative;
  const name = basenameOf(relative);
  for (let n = 2; n <= 500; n++) {
    const candidate = replaceBasename(relative, suffixed(name, n));
    if (!(await targetExists(workspaceId, candidate))) return candidate;
  }
  return replaceBasename(relative, `${name}-${Date.now()}`);
}

async function copyFile(
  src: string,
  dest: string,
  state: { copied: number; failed: number },
  onProgress?: (p: ImportProgress) => void,
  total = 0
): Promise<void> {
  const parent = dest.substring(0, dest.lastIndexOf("/"));
  if (parent) await makeDir(parent);
  try {
    await FileSystem.copyAsync({ from: toUri(src), to: toUri(dest) });
    state.copied++;
  } catch (_) {
    state.failed++;
  }
  try {
    onProgress?.({ done: state.copied + state.failed, total, current: basenameOf(src) });
  } catch (_) {}
}

/**
 * Copy a phone file or folder into the workspace.
 * Returns null when the source no longer exists.
 */
export async function importEntry({
  workspaceId,
  sourcePath,
  destRelativeDir = "",
  policy = "rename",
  onProgress,
}: ImportEntryOptions): Promise<ImportOutcome | null> {
  // Refuse whole storage volumes up front — before any stat, so the guard
  // holds even when the volume can't be read.
  if (isStorageRoot(sourcePath)) {
    throw new Error("That is a whole storage volume — open a folder inside it first.");
  }

  const info = await getFileInfo(sourcePath);
  if (!info.exists) return null;

  const name = basenameOf(sourcePath);
  const destDir = cleanRelative(destRelativeDir);
  const proposed = destDir ? `${destDir}/${name}` : name;

  let targetRelative = proposed;
  if (await targetExists(workspaceId, proposed)) {
    if (policy === "skip") {
      return { copied: 0, failed: 0, targetRelative: proposed, skipped: true };
    }
    if (policy === "overwrite") {
      await deletePath(await workspaceAbsolutePath(workspaceId, proposed));
    } else {
      targetRelative = await uniqueRelativePath(workspaceId, proposed);
    }
  }

  const destFull = await workspaceAbsolutePath(workspaceId, targetRelative);
  const state = { copied: 0, failed: 0 };

  if (info.isDirectory) {
    const listing = await listTree(sourcePath);
    if (listing.files.length > MAX_IMPORT_FILES) {
      throw new Error(
        `That folder holds ${listing.files.length} files (limit ${MAX_IMPORT_FILES}). Import a smaller folder.`
      );
    }
    const total = listing.files.length;
    await makeDir(destFull);
    // Directories first so empty folders survive the copy.
    for (const rel of listing.dirs) {
      await makeDir(`${destFull}/${rel}`);
    }
    for (const file of listing.files) {
      await copyFile(file.fullPath, `${destFull}/${file.relativePath}`, state, onProgress, total);
    }
    if (total === 0) onProgress?.({ done: 0, total: 0, current: name });
  } else {
    await copyFile(sourcePath, destFull, state, onProgress, 1);
  }

  notifyWorkspaceChanged(workspaceId);
  return { copied: state.copied, failed: state.failed, targetRelative, skipped: false };
}
