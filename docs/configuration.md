# Configuration

All user settings persist in `config.json` under the app's document directory
and are accessed through `src/ide/services/configService.ts`, which notifies
`subscribeConfigChanges` listeners on every save.

## `AppConfig` reference

| Field | Default | Meaning |
|---|---|---|
| `apiKey` / `apiKeys` / `activeKeyIndex` | empty | Gemini key(s); first key is active; normalized + de-duplicated on load |
| `selectedModel` | `gemini-3.5-flash-lite` | AI-generated commit summaries (see `SUPPORTED_MODELS`) |
| `selectedTheme` | `dark` | `dark` / `light` / `midnight` |
| `bottomTabs` | all on | Visibility of the four bottom tabs: `editor`, `terminal`, `browser`, `git` |
| `hasCompletedStartup` | `false` | Set once the first-run wizard finishes |
| `keyboardMouseMode` | `false` | Physical keyboard/mouse affordances (shortcuts, hidden navbar) |
| `terminalFontSize` | `14` | Terminal font size |
| `editorSettings` | see below | Tab size, auto-close brackets/quotes, auto-indent, completions, format-on-save, indent guides, font size |
| `githubClientId` / `githubClientSecret` | empty | OAuth app credentials for browser login |
| `githubToken` / `githubUsername` / `githubEmail` / `githubAvatarUrl` | empty | Saved GitHub account + HTTPS git credentials |

Helpers: `loadConfig` / `saveConfig` (nested-merge `bottomTabs`),
`loadApiKeys`, `rollNextApiKey`, `loadSelectedModel`,
`loadBottomTabs` / `saveBottomTabs`, `maskApiKey`, `normalizeApiKeys`,
`normalizeBottomTabs`, `firstVisibleTab`.

Legacy agent-era keys (`astraEnabled`, `selectedCognitiveMode`,
`selectedEffort`, `interactiveApproval`) are stripped on load — the agent
and its Agents tab no longer exist.

## Supported models (`SUPPORTED_MODELS`)

Gemini 3.5 Flash Lite (default), 3.5 Flash, 3.6 Flash, Flash Latest, Pro
Latest, 3.1 Pro Preview.

## Storage paths (`storagePaths.ts`)

- `getWorkspacesDir()` — canonical app-private `workspaces/` dir.
- `getDefaultPickerBase()` — directory picker start location.
- `getQuickPaths()` — Android-only `/sdcard` jumps (Godot, Documents,
  Download, SDCard); Workspaces + Documents elsewhere.
- `formatDisplayPath()`, `getDefaultWorkspacePreviewPath()`,
  `getPickerTitle()`, `getParentDirLabel()`,
  `getCustomDirPlaceholder()` — display strings and placeholders.

## Android setup (`app.json`)

- Package `com.janelle.aicoder` (`Astra`), dark background, cleartext HTTP
  allowed (localhost dev servers), `INTERNET` + read/write +
  `MANAGE_EXTERNAL_STORAGE` permissions, `expo-asset` + `expo-font` plugins.

## TypeScript / Metro

- `tsconfig.json` extends the Expo base; `node_modules` excluded. Verify
  with `npx tsc --noEmit` (must be clean).
- `metro.config.js` shims Node builtins (`fs`, `os`, `path`, `crypto`,
  `inspector`, `perf_hooks`, `typescript`) via `metro-shims/empty.js` for
  the in-WebView TypeScript compiler, and blocks direct
  `monaco-editor`/`xterm` imports — those ship only as offline WebView
  blobs built by `scripts/build-*-html.js`.