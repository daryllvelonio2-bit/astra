import * as FileSystem from "expo-file-system/legacy";
import {
  loadExtensionRegistry,
  subscribeExtensionRegistry,
  getInstalledIconThemes,
} from "./extensionRegistry";
import { readExtensionJson } from "./vsixExtractor";

export interface IconThemeDefinition {
  iconDefinitions?: Record<string, { iconPath?: string }>;
  file?: string;
  folder?: string;
  folderExpanded?: string;
  rootFolder?: string;
  rootFolderExpanded?: string;
  fileExtensions?: Record<string, string>;
  fileNames?: Record<string, string>;
  languageIds?: Record<string, string>;
}

export interface ActiveIconTheme {
  id: string;
  label: string;
  installDir: string;
  themeDir: string;
  definition: IconThemeDefinition;
}

let activeTheme: ActiveIconTheme | null = null;
const svgCache = new Map<string, string>();
const pendingReads = new Set<string>();
const listeners = new Set<() => void>();

/**
 * Resolves and normalizes relative path segments (e.g. '../', './') without node:path.
 */
export function resolvePath(base: string, relative: string): string {
  const combined = `${base}/${relative}`.replace(/\\/g, "/");
  const isAbs = combined.startsWith("/");
  const parts = combined.split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (stack.length > 0) stack.pop();
    } else {
      stack.push(part);
    }
  }
  return (isAbs ? "/" : "") + stack.join("/");
}

export function subscribeIconTheme(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notifySubscribers() {
  for (const fn of listeners) {
    try {
      fn();
    } catch (_) {}
  }
}

/**
 * Loads and caches the currently active icon theme from the extension registry.
 */
export async function reloadActiveIconTheme(): Promise<ActiveIconTheme | null> {
  try {
    const reg = await loadExtensionRegistry();
    const activeId = reg.activeIconThemeId;

    if (!activeId) {
      activeTheme = null;
      svgCache.clear();
      pendingReads.clear();
      notifySubscribers();
      return null;
    }

    const allThemes = await getInstalledIconThemes();
    const found = allThemes.find((t) => t.id === activeId);
    if (!found) {
      activeTheme = null;
      svgCache.clear();
      pendingReads.clear();
      notifySubscribers();
      return null;
    }

    const fullPath = resolvePath(found.installDir, found.path);
    const def = await readExtensionJson<IconThemeDefinition>(fullPath);
    if (!def) {
      activeTheme = null;
      svgCache.clear();
      pendingReads.clear();
      notifySubscribers();
      return null;
    }

    const cleanThemePath = found.path.replace(/^\.\//, "");
    const themeDir = cleanThemePath.includes("/")
      ? cleanThemePath.substring(0, cleanThemePath.lastIndexOf("/"))
      : "";

    activeTheme = {
      id: found.id,
      label: found.label,
      installDir: found.installDir,
      themeDir,
      definition: def,
    };

    svgCache.clear();
    pendingReads.clear();
    notifySubscribers();
    return activeTheme;
  } catch {
    activeTheme = null;
    svgCache.clear();
    pendingReads.clear();
    return null;
  }
}

// Subscribe to extension registry changes to reload icon theme automatically
subscribeExtensionRegistry((state) => {
  if (state.activeIconThemeId !== activeTheme?.id) {
    reloadActiveIconTheme();
  }
});

/**
 * Synchronous lookup of cached SVG string for an icon path.
 * Reads asynchronously and caches if not present yet.
 */
export function getCachedSvg(svgPath: string): string | null {
  if (svgCache.has(svgPath)) {
    const val = svgCache.get(svgPath);
    return val || null;
  }

  if (pendingReads.has(svgPath)) {
    return null;
  }

  pendingReads.add(svgPath);
  FileSystem.readAsStringAsync(svgPath)
    .then((content) => {
      pendingReads.delete(svgPath);
      if (content && content.includes("<svg")) {
        svgCache.set(svgPath, content);
        notifySubscribers();
      } else {
        svgCache.set(svgPath, "");
      }
    })
    .catch(() => {
      pendingReads.delete(svgPath);
      svgCache.set(svgPath, "");
    });

  return null;
}

/**
 * Resolves an SVG string from the currently active icon theme for a file or folder.
 * Returns null if no icon theme is active, or if the file has no matching icon.
 */
export function getActiveIconThemeSvg(
  fileName: string,
  isFolder = false,
  isExpanded = false
): string | null {
  if (!activeTheme || !activeTheme.definition) return null;

  const def = activeTheme.definition;
  const iconDefs = def.iconDefinitions || {};
  let defKey: string | undefined;

  if (isFolder) {
    defKey = isExpanded ? (def.folderExpanded || def.folder) : def.folder;
  } else {
    const lowerName = fileName.toLowerCase();

    // 1. Exact filename match (e.g. package.json, .gitignore, Dockerfile)
    if (def.fileNames && def.fileNames[lowerName]) {
      defKey = def.fileNames[lowerName];
    } else {
      // 2. Compound extension match (e.g. test.tsx, spec.ts, d.ts)
      const parts = lowerName.split(".");
      if (parts.length > 2 && def.fileExtensions) {
        const compound = parts.slice(1).join(".");
        if (def.fileExtensions[compound]) {
          defKey = def.fileExtensions[compound];
        }
      }

      // 3. Single extension match (e.g. java, py, ts, cpp)
      if (!defKey && parts.length > 1 && def.fileExtensions) {
        const ext = parts[parts.length - 1];
        if (def.fileExtensions[ext]) {
          defKey = def.fileExtensions[ext];
        }
      }

      // 4. Default file icon in the theme
      if (!defKey && def.file) {
        defKey = def.file;
      }
    }
  }

  if (!defKey || !iconDefs[defKey]) return null;

  const iconDef = iconDefs[defKey];
  if (!iconDef.iconPath) return null;

  const baseDir = activeTheme.themeDir
    ? `${activeTheme.installDir}/${activeTheme.themeDir}`
    : activeTheme.installDir;
  const fullSvgPath = resolvePath(baseDir, iconDef.iconPath);

  return getCachedSvg(fullSvgPath);
}

// Initial trigger to load active icon theme on app launch
reloadActiveIconTheme().catch(() => {});