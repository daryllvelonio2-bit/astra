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
  const r = computeWorkspaceFingerprintSync(readDir, rootPath, maxDepth);
  return r.fp;
}

export interface FingerprintStats {
  /** Directories listed during the walk. */
  dirCount: number;
  /** Wall time in ms. */
  durationMs: number;
}

function computeWorkspaceFingerprintSync(
  readDir: WatcherReadDir,
  rootPath: string,
  maxDepth: number
): FingerprintStats & { fp: string } {
  const started = Date.now();
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

  const fp = walk(rootPath, 0).toString(16);
  return { fp, dirCount: visited.size, durationMs: Date.now() - started };
}

/**
 * Chunked async twin of the walk above: yields to the JS thread every
 * `yieldEvery` directories so sidebar-resize animation frames (JS-driven)
 * and taps interleave instead of queueing behind a multi-second block.
 * Same traversal order and hash — fingerprints match the sync version.
 */
export async function computeWorkspaceFingerprintAsync(
  readDir: WatcherReadDir,
  rootPath: string,
  maxDepth: number = WATCHER_MAX_DEPTH,
  yieldEvery: number = 25,
  stats?: FingerprintStats
): Promise<string> {
  const started = Date.now();
  const visited = new Set<string>();
  let dirCount = 0;
  const yieldTick = () => new Promise<void>((r) => setTimeout(r, 0));

  async function walk(dirPath: string, depth: number): Promise<number> {
    let hash = 0x811c9dc5;
    let entries: NativeDirEntry[];
    try {
      entries = readDir(dirPath.endsWith("/") ? dirPath : `${dirPath}/`) || [];
    } catch (_) {
      return hash >>> 0;
    }
    if (++dirCount % yieldEvery === 0) await yieldTick();
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
        hash = mixNum(hash, await walk(e.path, depth + 1));
      }
    }
    return hash >>> 0;
  }

  const fp = (await walk(rootPath, 0)).toString(16);
  if (stats) {
    stats.dirCount = dirCount;
    stats.durationMs = Date.now() - started;
  }
  return fp;
}
