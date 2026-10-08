import * as FileSystem from "expo-file-system/legacy";
import { getFileInfo, readFileText, writeFileText } from "./nativeFs";

export const DEFAULT_MODEL_ID = "gemini-3.5-flash-lite";

export interface ModelOption {
  id: string;
  name: string;
  description?: string;
}

const CONFIG_FILE = `${FileSystem.documentDirectory}config.json`;

export type AppTheme = "dark" | "light" | "midnight" | (string & {});
export type ToggleableBottomTab = "editor" | "terminal" | "browser" | "git" | "host";
export type BottomTabVisibility = Record<ToggleableBottomTab, boolean>;

export const TAB_ORDER: ToggleableBottomTab[] = ["editor", "terminal", "browser", "git", "host"];

export const DEFAULT_BOTTOM_TABS: BottomTabVisibility = {
  editor: true,
  terminal: true,
  browser: true,
  git: true,
  // Hosting is new and still proving itself, so it stays OFF until asked for
  // (Settings -> BOTTOM BAR NAVIGATION -> Host). One project can be published at
  // a time and it keeps a server and a tunnel alive, which is not something to
  // switch on silently.
  host: false,
};

export function normalizeBottomTabs(value?: Partial<BottomTabVisibility> | null): BottomTabVisibility {
  // Legacy configs may carry editor:false with the removed vscode tab on —
  // the native editor is now the only editor, so force it visible then.
  const legacyVscode = (value as Record<string, boolean> | null | undefined)?.vscode;
  return {
    editor: legacyVscode ? true : (value?.editor ?? DEFAULT_BOTTOM_TABS.editor),
    terminal: value?.terminal ?? DEFAULT_BOTTOM_TABS.terminal,
    browser: value?.browser ?? DEFAULT_BOTTOM_TABS.browser,
    git: value?.git ?? DEFAULT_BOTTOM_TABS.git,
    host: value?.host ?? DEFAULT_BOTTOM_TABS.host,
  };
}

export function firstVisibleTab(tabs: BottomTabVisibility): ToggleableBottomTab {
  return TAB_ORDER.find((t) => tabs[t]) ?? "editor";
}

export interface EditorSettings {
  tabSize: 2 | 4;
  autoCloseBrackets: boolean;
  autoCloseQuotes: boolean;
  autoIndentOnEnter: boolean;
  enableCompletions: boolean;
  showIndentGuides?: boolean;
  fontSize?: number;
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  tabSize: 2,
  autoCloseBrackets: true,
  autoCloseQuotes: true,
  autoIndentOnEnter: true,
  enableCompletions: true,
  showIndentGuides: true,
  fontSize: 14,
};


export type NotificationChannel = "banner" | "system" | "off";

export interface NotificationRouting {
  github: NotificationChannel;
  terminal: NotificationChannel;
  agent: NotificationChannel;
  app: NotificationChannel;
}

export const DEFAULT_NOTIFICATION_ROUTING: NotificationRouting = {
  github: "banner",
  terminal: "banner",
  agent: "banner",
  app: "banner",
};

export function normalizeNotificationRouting(
  value?: Partial<NotificationRouting> | null
): NotificationRouting {
  const pick = (v: unknown, fallback: NotificationChannel): NotificationChannel =>
    v === "banner" || v === "system" || v === "off" ? v : fallback;
  return {
    github: pick(value?.github, DEFAULT_NOTIFICATION_ROUTING.github),
    terminal: pick(value?.terminal, DEFAULT_NOTIFICATION_ROUTING.terminal),
    agent: pick(value?.agent, DEFAULT_NOTIFICATION_ROUTING.agent),
    app: pick(value?.app, DEFAULT_NOTIFICATION_ROUTING.app),
  };
}

export interface AppConfig {
  apiKey: string;
  /** Per-source global notification routing (Settings → Alerts). */
  notifications?: Partial<NotificationRouting>;
  apiKeys?: string[];
  activeKeyIndex?: number;
  selectedModel: string;
  selectedTheme: AppTheme;
  bottomTabs: BottomTabVisibility;
  hasCompletedStartup?: boolean;
  keyboardMouseMode?: boolean;
  terminalFontSize?: number;
  editorSettings: EditorSettings;
  githubToken?: string;
  githubUsername?: string;
  githubEmail?: string;
  githubAvatarUrl?: string;
  /** Last address shown in the built-in browser, restored on cold start. */
  browserUrl?: string;
}

const DEFAULT_CONFIG: AppConfig = {
  apiKey: "",
  apiKeys: [],
  activeKeyIndex: 0,
  selectedModel: DEFAULT_MODEL_ID,
  selectedTheme: "dark",
  bottomTabs: { ...DEFAULT_BOTTOM_TABS },
  hasCompletedStartup: false,
  keyboardMouseMode: false,
  terminalFontSize: 14,
  editorSettings: { ...DEFAULT_EDITOR_SETTINGS },
  githubToken: "",
  githubUsername: "",
  githubEmail: "",
  githubAvatarUrl: "",
  browserUrl: "",
};

export function normalizeApiKeys(keys?: string[], fallbackKey?: string): string[] {
  const list: string[] = [];
  if (Array.isArray(keys)) {
    for (const k of keys) {
      const trimmed = (k || "").trim();
      if (trimmed && !list.includes(trimmed)) {
        list.push(trimmed);
      }
    }
  }
  if (fallbackKey) {
    const trimmedFallback = fallbackKey.trim();
    if (trimmedFallback && !list.includes(trimmedFallback)) {
      list.unshift(trimmedFallback);
    }
  }
  return list;
}

export function maskApiKey(key: string): string {
  if (!key) return "";
  const trimmed = key.trim();
  if (trimmed.length <= 8) return trimmed.slice(0, 3) + "...";
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

export async function loadConfig(): Promise<AppConfig> {
  try {
    const info = await getFileInfo(CONFIG_FILE);
    if (info.exists) {
      const data = await readFileText(CONFIG_FILE);
      const parsed = JSON.parse(data);
      const normalizedKeys = normalizeApiKeys(parsed.apiKeys, parsed.apiKey);
      delete parsed.defaultEditorUi; // removed feature: native editor only
      delete parsed.astraEnabled; // removed feature: agents tab
      delete parsed.selectedCognitiveMode; // removed feature: agents tab
      delete parsed.selectedEffort; // removed feature: agents tab
      delete parsed.interactiveApproval; // removed feature: agents tab
      const tabs = normalizeBottomTabs(parsed.bottomTabs);
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        bottomTabs: tabs,
        apiKeys: normalizedKeys,
        apiKey: normalizedKeys[0] || parsed.apiKey || "",
        editorSettings: {
          ...DEFAULT_EDITOR_SETTINGS,
          ...(parsed.editorSettings || {}),
        },
      };
    }
  } catch (e) {
    console.error("Failed to load config, using defaults:", e);
  }
  return DEFAULT_CONFIG;
}

type ConfigChangeListener = (config: AppConfig) => void;
const configChangeListeners = new Set<ConfigChangeListener>();

export function subscribeConfigChanges(listener: ConfigChangeListener): () => void {
  configChangeListeners.add(listener);
  return () => configChangeListeners.delete(listener);
}

let _configWriteQueue = Promise.resolve();

export async function saveConfig(config: Partial<AppConfig>): Promise<void> {
  _configWriteQueue = _configWriteQueue.then(async () => {
    try {
      const current = await loadConfig();
      const updated = { ...current, ...config };
      
      // Synchronize apiKeys and apiKey
      if (config.apiKeys !== undefined) {
        updated.apiKeys = normalizeApiKeys(config.apiKeys);
        updated.apiKey = updated.apiKeys[0] || "";
      } else if (config.apiKey !== undefined) {
        const trimmed = config.apiKey.trim();
        updated.apiKey = trimmed;
        if (trimmed) {
          updated.apiKeys = normalizeApiKeys([trimmed, ...(current.apiKeys || [])]);
        } else {
          updated.apiKeys = [];
        }
      }

      await writeFileText(CONFIG_FILE, JSON.stringify(updated, null, 2));
      configChangeListeners.forEach((listener) => {
        try {
          listener(updated);
        } catch (e) {
          console.error("Config change listener error:", e);
        }
      });
    } catch (e) {
      console.error("Failed to save config:", e);
    }
  });
  return _configWriteQueue;
}

export async function saveTheme(theme: AppTheme): Promise<void> {
  await saveConfig({ selectedTheme: theme });
}

export async function loadTheme(): Promise<AppTheme> {
  const config = await loadConfig();
  return config.selectedTheme || "dark";
}

export async function loadBottomTabs(): Promise<BottomTabVisibility> {
  const config = await loadConfig();
  return normalizeBottomTabs(config.bottomTabs);
}

export async function saveBottomTabs(tabs: BottomTabVisibility): Promise<void> {
  await saveConfig({ bottomTabs: normalizeBottomTabs(tabs) });
}

export async function loadHasCompletedStartup(): Promise<boolean> {
  const config = await loadConfig();
  return !!config.hasCompletedStartup;
}

export async function saveHasCompletedStartup(completed: boolean): Promise<void> {
  await saveConfig({ hasCompletedStartup: completed });
}

export async function loadKeyboardMouseMode(): Promise<boolean> {
  const config = await loadConfig();
  return !!config.keyboardMouseMode;
}

export async function saveKeyboardMouseMode(enabled: boolean): Promise<void> {
  await saveConfig({ keyboardMouseMode: !!enabled });
}

export async function loadEditorSettings(): Promise<EditorSettings> {
  const config = await loadConfig();
  return { ...DEFAULT_EDITOR_SETTINGS, ...(config.editorSettings || {}) };
}

export async function saveEditorSettings(settings: Partial<EditorSettings>): Promise<void> {
  const current = await loadEditorSettings();
  await saveConfig({ editorSettings: { ...current, ...settings } });
}

export async function loadTerminalFontSize(): Promise<number> {
  const config = await loadConfig();
  return typeof config.terminalFontSize === "number" ? config.terminalFontSize : 14;
}

export async function saveTerminalFontSize(fontSize: number): Promise<void> {
  await saveConfig({ terminalFontSize: fontSize });
}

export async function loadBrowserUrl(): Promise<string> {
  const config = await loadConfig();
  return typeof config.browserUrl === "string" ? config.browserUrl : "";
}

export async function saveBrowserUrl(url: string): Promise<void> {
  await saveConfig({ browserUrl: (url || "").trim() });
}
