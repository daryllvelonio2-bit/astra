import * as FileSystem from "expo-file-system/legacy";
import {
  ExtensionMarketplaceItem,
  ExtensionRegistryState,
  ExtensionSnippet,
  ExtensionTheme,
  InstalledExtension,
} from "./types";
import { downloadAndExtractVsix, readExtensionJson } from "./vsixExtractor";
import { deletePath, makeDir, writeFileText } from "../nativeFs";
import { convertVsCodeThemeToThemeColors } from "./themeAdapter";
import type { ThemeColors } from "../../../theme/themeContext";
import { saveTheme } from "../configService";
import { checkAndInstallMissingRuntimesForInstalledExtensions } from "./extensionRuntimeService";

function getRegistryFilePath(): string {
  const base = FileSystem.documentDirectory || "/data/user/0/com.janelle.aicoder/files/";
  return `${base.replace(/\/+$/, "")}/extensions/registry.json`;
}

let cachedState: ExtensionRegistryState | null = null;
const listeners = new Set<(state: ExtensionRegistryState) => void>();

export function subscribeExtensionRegistry(fn: (state: ExtensionRegistryState) => void) {
  listeners.add(fn);
  if (cachedState) fn(cachedState);
  return () => {
    listeners.delete(fn);
  };
}

function notifyListeners(state: ExtensionRegistryState) {
  cachedState = state;
  listeners.forEach((fn) => {
    try {
      fn(state);
    } catch {}
  });
}

let hasCheckedRuntimes = false;

function triggerBackgroundRuntimeCheck(installed?: Record<string, InstalledExtension>) {
  if (hasCheckedRuntimes || !installed) return;
  hasCheckedRuntimes = true;
  const exts = Object.values(installed);
  setTimeout(() => {
    checkAndInstallMissingRuntimesForInstalledExtensions(exts).catch(() => {});
  }, 1200);
}

/**
 * Loads registry state from storage.
 */
export async function loadExtensionRegistry(): Promise<ExtensionRegistryState> {
  if (cachedState) {
    triggerBackgroundRuntimeCheck(cachedState.installed);
    return cachedState;
  }

  const regPath = getRegistryFilePath();
  try {
    const info = await FileSystem.getInfoAsync(regPath);
    if (info.exists) {
      const content = await FileSystem.readAsStringAsync(regPath);
      const parsed = JSON.parse(content);
      cachedState = {
        installed: parsed.installed || {},
        activeThemeId: parsed.activeThemeId,
        activeIconThemeId: parsed.activeIconThemeId,
      };
      triggerBackgroundRuntimeCheck(cachedState.installed);
      return cachedState;
    }
  } catch {}

  cachedState = { installed: {} };
  return cachedState;
}

/**
 * Persists registry state to storage.
 */
async function saveExtensionRegistry(state: ExtensionRegistryState): Promise<void> {
  const regPath = getRegistryFilePath();
  const dir = regPath.substring(0, regPath.lastIndexOf("/"));
  await makeDir(dir);
  await writeFileText(regPath, JSON.stringify(state, null, 2));
  notifyListeners(state);
}

/**
 * Installs a new extension from marketplace.
 */
export async function installExtension(
  item: ExtensionMarketplaceItem,
  onProgress?: (percent: number, status: string) => void
): Promise<InstalledExtension> {
  const installed = await downloadAndExtractVsix(item, onProgress);
  const state = await loadExtensionRegistry();
  state.installed[installed.id] = installed;
  await saveExtensionRegistry(state);
  return installed;
}

/**
 * Uninstalls an extension and removes its local assets.
 */
export async function uninstallExtension(id: string): Promise<boolean> {
  const state = await loadExtensionRegistry();
  const ext = state.installed[id];
  if (!ext) return false;

  try {
    await deletePath(ext.installDir);
  } catch {}

  delete state.installed[id];
  let resetTheme = false;
  if (state.activeThemeId?.startsWith(id)) {
    delete state.activeThemeId;
    resetTheme = true;
  }
  await saveExtensionRegistry(state);
  if (resetTheme) {
    await saveTheme("dark");
  }
  return true;
}

/**
 * Toggles an extension on/off.
 */
export async function toggleExtension(id: string): Promise<boolean> {
  const state = await loadExtensionRegistry();
  const ext = state.installed[id];
  if (!ext) return false;

  ext.enabled = !ext.enabled;
  await saveExtensionRegistry(state);
  return ext.enabled;
}

/**
 * Collects all snippets from enabled extensions matching a given language or file extension.
 */
export async function getInstalledSnippets(fileExtension?: string): Promise<ExtensionSnippet[]> {
  const state = await loadExtensionRegistry();
  const allSnippets: ExtensionSnippet[] = [];

  const extNorm = (fileExtension || "").replace(/^\./, "").toLowerCase();

  for (const ext of Object.values(state.installed)) {
    if (!ext.enabled || !ext.snippets) continue;

    for (const snip of ext.snippets) {
      const fullPath = `${ext.installDir}/${snip.path}`;
      const data = await readExtensionJson<Record<string, any>>(fullPath);
      if (!data) continue;

      for (const [key, val] of Object.entries(data)) {
        if (!val || !val.prefix) continue;

        // Check if snippet matches file extension via language container
        if (snip.language) {
          const lang = snip.language.toLowerCase();
          if (extNorm && !isLanguageMatch(lang, extNorm)) {
            continue;
          }
        }

        // Check if snippet matches file extension via scope definition
        if (val.scope && typeof val.scope === "string" && extNorm) {
          const scopes = val.scope.split(",").map((s: string) => s.trim().toLowerCase());
          const matchesScope = scopes.some((s: string) => isLanguageMatch(s, extNorm));
          if (!matchesScope) {
            continue;
          }
        }

        const prefixes: string[] = Array.isArray(val.prefix) ? val.prefix : [val.prefix];
        for (const p of prefixes) {
          if (!p) continue;
          allSnippets.push({
            prefix: p,
            body: val.body,
            description: val.description || key,
            scope: val.scope,
          });
        }
      }
    }
  }

  return allSnippets;
}

function isLanguageMatch(snippetLang: string, fileExt: string): boolean {
  const cleanLang = snippetLang.replace(/^(source|text)\./, "").toLowerCase();
  const map: Record<string, string[]> = {
    javascript: ["js", "jsx", "mjs"],
    typescript: ["ts", "tsx"],
    javascriptreact: ["jsx", "tsx", "js"],
    typescriptreact: ["tsx", "ts"],
    python: ["py", "pyw"],
    rust: ["rs"],
    go: ["go"],
    c: ["c", "h"],
    cpp: ["cpp", "hpp", "cc", "cxx"],
    java: ["java"],
    kotlin: ["kt", "kts"],
    csharp: ["cs"],
    ruby: ["rb"],
    dart: ["dart"],
    shellscript: ["sh", "bash", "zsh"],
    shell: ["sh", "bash", "zsh"],
    bash: ["sh", "bash", "zsh"],
    markdown: ["md", "markdown"],
    xml: ["xml", "svg", "plist"],
    yaml: ["yaml", "yml"],
    sql: ["sql"],
    vue: ["vue"],
    svelte: ["svelte"],
    html: ["html", "htm"],
    css: ["css", "scss", "less"],
    scss: ["scss"],
    less: ["less"],
    json: ["json", "jsonc"],
    jsonc: ["json", "jsonc"],
  };

  const matches = map[cleanLang] || [cleanLang];
  return matches.includes(fileExt);
}

/**
 * Retrieves all themes from all enabled extensions.
 */
export async function getInstalledThemes(): Promise<
  Array<{ id: string; label: string; theme: ExtensionTheme; themeData: any }>
> {
  const state = await loadExtensionRegistry();
  const results: Array<{ id: string; label: string; theme: ExtensionTheme; themeData: any }> = [];

  for (const ext of Object.values(state.installed)) {
    if (!ext.enabled || !ext.themes) continue;

    for (const t of ext.themes) {
      const fullPath = `${ext.installDir}/${t.path}`;
      const data = await readExtensionJson(fullPath);
      if (data) {
        results.push({
          id: t.id,
          label: `${t.label} (${ext.displayName})`,
          theme: t,
          themeData: data,
        });
      }
    }
  }

  return results;
}

/**
 * Sets the active extension theme ID in the registry.
 */
export async function setActiveThemeId(themeId?: string): Promise<void> {
  const state = await loadExtensionRegistry();
  state.activeThemeId = themeId;
  await saveExtensionRegistry(state);
}

/**
 * Gets the current active extension theme ID from the registry.
 */
export async function getActiveThemeId(): Promise<string | undefined> {
  const state = await loadExtensionRegistry();
  return state.activeThemeId;
}

/**
 * Loads all installed themes converted to ThemeColors instances.
 */
export async function loadAllExtensionThemeColors(): Promise<Record<string, ThemeColors>> {
  const themes = await getInstalledThemes();
  const map: Record<string, ThemeColors> = {};
  for (const item of themes) {
    const themeColors = convertVsCodeThemeToThemeColors(
      item.id,
      item.theme.label || item.label,
      item.themeData,
      item.theme.uiTheme
    );
    map[item.id] = themeColors;
  }
  return map;
}

/**
 * Retrieves all icon themes from all enabled extensions.
 */
export async function getInstalledIconThemes(): Promise<
  Array<{ id: string; label: string; extensionId: string; installDir: string; path: string }>
> {
  const state = await loadExtensionRegistry();
  const results: Array<{ id: string; label: string; extensionId: string; installDir: string; path: string }> = [];

  for (const ext of Object.values(state.installed)) {
    if (!ext.enabled || !ext.iconThemes) continue;
    for (const it of ext.iconThemes) {
      results.push({
        id: it.id,
        label: it.label,
        extensionId: ext.id,
        installDir: ext.installDir,
        path: it.path,
      });
    }
  }

  return results;
}

/**
 * Activates an installed icon theme (or undefined to revert to default vector icons).
 */
export async function setActiveIconTheme(iconThemeId?: string): Promise<void> {
  const state = await loadExtensionRegistry();
  state.activeIconThemeId = iconThemeId;
  await saveExtensionRegistry(state);
}
