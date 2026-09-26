import type { NativeDirEntry } from "../../../modules/linux-runner/src";

/** Directories never worth re-scanning (deps, build output, VCS, caches). */
const IGNORED_NAMES = new Set([
  "node_modules", "vendor", ".git", "dist", "build", ".cache",
  "coverage", ".idea", ".vscode",
]);

/** Deep enough for real trees (android/app/src/main/… is 6); depth still bounds symlink loops. */
export const WATCHER_MAX_DEPTH = 8;

export type WatcherReadDir = (dirPath: string) => NativeDirEntry[] | null | undefined;

// FNV-1a over UTF-16 code units — O(1) memory, no giant fingerprint strings.
function mixStr(hash: number, s: string): number {
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash;
}

function mixNum(hash: number, n: number): number {
  return mixStr(hash, `#${Math.floor(n || 0)};`);
}

/**
 * Pure directory fingerprint: structural hash over names, kinds, mtimes and
 * sizes. `readDir` is injected so this runs in tests with a fake FS and on
 * device with `readDirectoryNative`. Sorted per directory, so readdir order
 * never causes a false refresh; symlink loops are cut by the visited set and
 * the depth bound.
 */
export function computeWorkspaceFingerprint(
  readDir: WatcherReadDir,
  rootPath: string,
  maxDepth: number = WATCHER_MAX_DEPTH
): string {
  const visited = new Set<string>();

  function walk(dirPath: string, depth: number): number {
    let hash = 0x811c9dc5;
    let entries: NativeDirEntry[];
    try {
      entries = readDir(dirPath.endsWith("/") ? dirPath : `${dirPath}/`) || [];
    } catch (_) {
      return hash >>> 0;
    }
    const sorted = entries.slice().sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of sorted) {
      if (!e || !e.name) continue;
      if (IGNORED_NAMES.has(e.name)) continue;
      if (e.name.startsWith(".") && e.name !== ".env" && e.name !== ".gitignore") continue;
      hash = mixStr(hash, e.name);
      hash = mixStr(hash, e.isDirectory ? "|d" : "|f");
      hash = mixNum(hash, e.lastModified);
      hash = mixNum(hash, e.size);
      if (e.isDirectory && depth < maxDepth && e.path && !visited.has(e.path)) {
        visited.add(e.path);
        hash = mixNum(hash, walk(e.path, depth + 1));
      }
    }
    return hash >>> 0;
  }

  return walk(rootPath, 0).toString(16);
}
