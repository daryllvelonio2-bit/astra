import JSZip from "jszip";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { getFileInfo, makeDir, hasAllFilesPermission } from "./nativeFs";
import { listTree, TreeFile } from "./fileTreeWalker";
import {
  getWorkspaceDirPath,
  normalizeCleanPath,
  resolveFullPath,
} from "./workspaceService";

/**
 * Export workspace content OUT to the phone: whole project as a .zip,
 * or a single file copied as-is. Sources stay untouched.
 */

export interface ExportProgress {
  done: number;
  total: number;
  current: string;
}

export interface ExportOutcome {
  /** Absolute path of the written file. */
  absolutePath: string;
  /** Number of files written (1 for a single-file export). */
  files: number;
  /** Workspace-relative paths left out (too large to zip). */
  skipped: string[];
}

export interface ExportOptions {
  workspaceId: string;
  /** Folder on the phone to write into. */
  destDir: string;
  onProgress?: (progress: ExportProgress) => void;
}

export interface ExportProjectOptions extends ExportOptions {
  projectName: string;
}

export interface ExportFileOptions extends ExportOptions {
  /** Workspace-relative path of the file to export. */
  relativePath: string;
}

/** Files bigger than this are left out of a project zip (memory guard). */
export const MAX_ZIP_FILE_BYTES = 64 * 1024 * 1024;
/**
 * Whole-project zip budget. The archive is built in memory and ends up as a
 * base64 string (~1.4x), so a generous cap would still risk an OOM kill —
 * beyond this we refuse with a clear message instead.
 */
export const MAX_ZIP_TOTAL_BYTES = 120 * 1024 * 1024;

const DEFLATE_EXTENSIONS = new Set([
  "js", "jsx", "mjs", "cjs", "ts", "tsx", "json", "md", "markdown", "txt", "html", "htm",
  "css", "scss", "sass", "less", "xml", "yml", "yaml", "toml", "ini", "cfg", "conf",
  "env", "sh", "bash", "zsh", "sql", "c", "h", "cpp", "hpp", "cc", "cs", "java", "kt",
  "kts", "gradle", "pro", "properties", "py", "rb", "go", "rs", "php", "swift", "dart",
  "vue", "svelte", "svg", "csv", "tsv", "log", "lock", "gitignore", "editorconfig",
]);

/**
 * Expo's FileSystem resolves paths literally, while our Kotlin layer maps
 * /sdcard -> /storage/emulated/0. Normalize before handing over a URI,
 * otherwise a Download/ destination can write nowhere on some devices.
 */
const toUri = (p: string) => `file://${normalizeCleanPath(p.replace(/^file:\/\//, ""))}`;
const basenameOf = (p: string) => p.replace(/\/+$/, "").split("/").filter(Boolean).pop() || "";

/** Store binaries, deflate text — DEFLATE on a JPEG only burns CPU. */
export function isCompressibleText(name: string): boolean {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot <= 0) return lower.startsWith(".") ? true : false;
  return DEFLATE_EXTENSIONS.has(lower.slice(dot + 1));
}

function suffixed(name: string, n: number): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return `${name}-${n}`;
  return `${name.slice(0, dot)}-${n}${name.slice(dot)}`;
}

/** Phone-visible default target: Download on Android. */
export function getDefaultExportDir(): string {
  if (Platform.OS === "android") return "/sdcard/Download/";
  const base = FileSystem.documentDirectory || "";
  return base ? `${base}exports/` : "exports/";
}

function ensureTrailingSlash(p: string): string {
  const clean = normalizeCleanPath(p).trim();
  if (!clean) return getDefaultExportDir();
  return clean.endsWith("/") ? clean : `${clean}/`;
}

/**
 * Writes outside the app sandbox need MANAGE_EXTERNAL_STORAGE. Fail with a
 * clear message instead of a silent write failure.
 */
function assertWritableTarget(destDir: string): void {
  const clean = normalizeCleanPath(destDir).trim();
  if (!clean) return;
  const docDir = normalizeCleanPath(FileSystem.documentDirectory || "");
  const isAppOwned = !!docDir && clean.startsWith(docDir);
  if (!isAppOwned && !hasAllFilesPermission()) {
    throw new Error(
      "Storage permission is required to export here.\nGrant \"All files access\" and try again."
    );
  }
}

/** First free `<dir>/<name>`, `<dir>/<name>-2`, … — never clobbers a file. */
export async function uniqueDestination(dir: string, name: string): Promise<string> {
  const cleanDir = ensureTrailingSlash(dir);
  let candidate = `${cleanDir}${name}`;
  if (!(await getFileInfo(candidate)).exists) return candidate;
  for (let n = 2; n <= 500; n++) {
    candidate = `${cleanDir}${suffixed(name, n)}`;
    if (!(await getFileInfo(candidate)).exists) return candidate;
  }
  return `${cleanDir}${suffixed(name, Date.now())}`;
}

function sanitizeFileName(name: string, fallback: string): string {
  const clean = (name || "").trim().replace(/[\\/:*?"<>|]/g, "-");
  return clean || fallback;
}

async function workspaceBaseDir(workspaceId: string): Promise<string> {
  const raw = await getWorkspaceDirPath(workspaceId);
  return normalizeCleanPath(raw).replace(/\/+$/, "");
}

/** Zip the whole workspace and write it to the phone. */
export async function exportProjectZip({
  workspaceId,
  projectName,
  destDir,
  onProgress,
}: ExportProjectOptions): Promise<ExportOutcome> {
  const baseDir = await workspaceBaseDir(workspaceId);
  const listing = await listTree(baseDir);
  assertWritableTarget(destDir);

  const included: TreeFile[] = [];
  const skipped: string[] = [];
  let totalBytes = 0;
  for (const file of listing.files) {
    if (file.size > MAX_ZIP_FILE_BYTES) {
      skipped.push(file.relativePath);
      continue;
    }
    if (totalBytes + file.size > MAX_ZIP_TOTAL_BYTES) {
      skipped.push(file.relativePath);
      continue;
    }
    totalBytes += file.size;
    included.push(file);
  }

  if (included.length === 0 && listing.files.length > 0) {
    const mb = Math.round(MAX_ZIP_TOTAL_BYTES / (1024 * 1024));
    throw new Error(`Project is too large to zip (limit ${mb} MB). Export single files instead.`);
  }
  if (included.length === 0) {
    throw new Error("This project has no files to export.");
  }

  const zip = new JSZip();
  // Register folders first so empty directories survive the round-trip.
  for (const rel of listing.dirs) zip.folder(rel);

  let done = 0;
  for (const file of included) {
    let base64 = "";
    try {
      base64 = await FileSystem.readAsStringAsync(toUri(file.fullPath), {
        encoding: FileSystem.EncodingType.Base64,
      });
    } catch (_) {
      continue;
    }
    zip.file(file.relativePath, base64, {
      base64: true,
      compression: isCompressibleText(file.name) ? "DEFLATE" : "STORE",
    });
    done++;
    try {
      onProgress?.({ done, total: included.length, current: file.name });
    } catch (_) {}
  }

  const archiveBase64 = await zip.generateAsync({ type: "base64", compression: "DEFLATE" });
  const fileName = `${sanitizeFileName(projectName, workspaceId)}.zip`;
  const target = await uniqueDestination(destDir, fileName);

  await makeDir(target.substring(0, target.lastIndexOf("/")));
  await FileSystem.writeAsStringAsync(toUri(target), archiveBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return { absolutePath: target, files: done, skipped };
}

/** Copy one workspace file to the phone, byte-for-byte. */
export async function exportSingleFile({
  workspaceId,
  relativePath,
  destDir,
  onProgress,
}: ExportFileOptions): Promise<ExportOutcome> {
  const baseDir = await workspaceBaseDir(workspaceId);
  const source = resolveFullPath(baseDir, relativePath.replace(/^\/+/, ""));
  const info = await getFileInfo(source);
  if (!info.exists || info.isDirectory) {
    throw new Error(`File not found in workspace: ${relativePath}`);
  }
  assertWritableTarget(destDir);

  const name = basenameOf(relativePath);
  const target = await uniqueDestination(destDir, name);
  await makeDir(target.substring(0, target.lastIndexOf("/")));

  onProgress?.({ done: 0, total: 1, current: name });
  await FileSystem.copyAsync({ from: toUri(source), to: toUri(target) });
  onProgress?.({ done: 1, total: 1, current: name });

  return { absolutePath: target, files: 1, skipped: [] };
}
