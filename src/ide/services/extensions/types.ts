/**
 * Types and interfaces for the Real VS Code / Open VSX Extension System.
 */

export interface ExtensionMarketplaceItem {
  id: string; // e.g. "dracula-theme.theme-dracula"
  namespace: string; // e.g. "dracula-theme"
  name: string; // e.g. "theme-dracula"
  version: string;
  displayName: string;
  description: string;
  publisher: string;
  iconUrl?: string;
  downloadUrl: string;
  downloadCount?: number;
  averageRating?: number;
  categories?: string[];
  installed?: boolean;
}

export interface ExtensionSnippet {
  prefix: string;
  body: string | string[];
  description?: string;
  scope?: string;
}

export interface ExtensionTheme {
  id: string;
  label: string;
  uiTheme: "vs-dark" | "vs" | "hc-black" | "hc-light";
  path: string; // relative path inside extension directory
}

export interface ExtensionIconTheme {
  id: string;
  label: string;
  path: string; // relative path inside extension directory
}

export interface ExtensionLanguageConfig {
  id: string;
  extensions?: string[];
  aliases?: string[];
  filenames?: string[];
  configuration?: string; // path to language-configuration.json
}

export interface InstalledExtension {
  id: string; // "publisher.name"
  displayName: string;
  description: string;
  version: string;
  publisher: string;
  iconUrl?: string;
  enabled: boolean;
  installedAt: number;
  installDir: string;
  themes: ExtensionTheme[];
  iconThemes?: ExtensionIconTheme[];
  snippets: Array<{ language?: string; path: string }>;
  languages: ExtensionLanguageConfig[];
  binaries?: string[];
  categories?: string[];
  keywords?: string[];
  isAgent?: boolean;
}


export interface ExtensionRegistryState {
  installed: Record<string, InstalledExtension>;
  activeThemeId?: string;
  activeIconThemeId?: string;
}
