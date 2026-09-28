import { readDirEntries } from "./nativeFs";
import { IGNORED_FOLDERS } from "./workspaceService";

/**
 * Shared recursive disk walker used by Import and Export.
 *
 * One listing pass up front yields every file (with size) and every directory,
 * which gives both services an accurate total for progress and lets them skip
 * ignored folders/dotfiles exactly like the explorer does.
 */

/** Dotfiles the explorer still shows — everything else dot-prefixed is hidden. */
export const ALLOWED_DOT_FILES = new Set([".env", ".gitignore", ".env.example"]);

/** Deep trees are truncated rather than blown up (matches workspace scan). */
const MAX_DEPTH = 12;

export interface TreeFile {
  name: string;
  /** Absolute path on disk. */
  fullPath: string;
  /** Path relative to the walked root, using `/` separators. */
  relativePath: string;
  size: number;
}

export interface TreeListing {
  files: TreeFile[];
  /** Directory paths relative to the walked root (empty = root itself). */
  dirs: string[];
}

/** True for entries the explorer hides: build dirs and unknown dotfiles. */
export function isIgnoredEntry(name: string): boolean {
  if (!name) return true;
  if (IGNORED_FOLDERS.has(name)) return true;
  if (name.startsWith(".") && !ALLOWED_DOT_FILES.has(name)) return true;
  return false;
}

/** Flat listing of a directory tree. Never throws — unreadable dirs are skipped. */
export async function listTree(rootPath: string): Promise<TreeListing> {
  const files: TreeFile[] = [];
  const dirs: string[] = [];
  await walk(rootPath, "", files, dirs, 0);
  return { files, dirs };
}

async function walk(
  dirPath: string,
  relDir: string,
  files: TreeFile[],
  dirs: string[],
  depth: number
): Promise<void> {
  if (depth > MAX_DEPTH) return;

  let entries;
  try {
    entries = await readDirEntries(dirPath);
  } catch (_) {
    return;
  }

  for (const entry of entries) {
    if (isIgnoredEntry(entry.name)) continue;
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory) {
      dirs.push(rel);
      await walk(entry.path, rel, files, dirs, depth + 1);
    } else {
      files.push({
        name: entry.name,
        fullPath: entry.path,
        relativePath: rel,
        size: entry.size || 0,
      });
    }
  }
}
