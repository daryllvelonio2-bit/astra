# Configuration

All user settings persist in `config.json` under the app's document directory
and are accessed through `src/ide/services/configService.ts`, which notifies
`subscribeConfigChanges` listeners on every save.

## `AppConfig` reference

| Field | Default | Meaning |
|---|---|---|
| `apiKey` / `apiKeys` / `activeKeyIndex` | empty | Gemini key(s); first key is active; normalized + de-duplicated on load |
| `selectedModel` | `gemini-3.5-flash-lite` | Agent + transcription model (see `SUPPORTED_MODELS`) |
| `selectedCognitiveMode` / `selectedEffort` | `default` | Agent reasoning mode and effort (`astraModes.ts`) |
| `interactiveApproval` | `false` | Always auto-approve (YOLO); no UI surface |
| `selectedTheme` | `dark` | `dark` / `light` / `midnight` |
| `astraEnabled` | `true` | Master Astra AI switch: controls visibility of the Agents bottom navbar tab |

Helpers: `loadConfig` / `saveConfig` (nested-merge `bottomTabs`),
`loadApiKeys`, `rollNextApiKey`, `loadSelectedModel`,
`loadBottomTabs` / `saveBottomTabs`, `loadAstraEnabled` /
`saveAstraEnabled`, `maskApiKey`, `normalizeApiKeys`,
`normalizeBottomTabs`, `firstVisibleTab`.

## Supported models (`SUPPORTED_MODELS`)

Gemini 3.5 Flash Lite (default), 3.5 Flash, 3.6 Flash, Flash Latest, Pro
Latest, 3.1 Pro Preview. Voice transcription is pinned to
`gemini-3.1-flash-lite`.

## Storage paths (`storagePaths.ts`)

- `getWorkspacesDir()` — canonical app-private `workspaces/` dir.
- `getDefaultPickerBase()` — directory picker start location.
- `getQuickPaths()` — Android-only `/sdcard` jumps (Godot, Documents,
  Download, SDCard); Workspaces + Documents elsewhere.
- `formatDisplayPath()`, `getDefaultWorkspacePreviewPath()`,
  `getPickerTitle()`, `getParentDirLabel()`,
  `getCustomDirPlaceholder()` — display strings and placeholders.

## Android setup (`app.json` / `eas.json`)

- Package `com.janelle.aicoder` (`Astra`), dark background, cleartext HTTP
  allowed (localhost servers/VNC), `INTERNET` + read/write +
  `MANAGE_EXTERNAL_STORAGE` permissions, `expo-asset` + `expo-font` plugins.
- EAS: `development` uses a dev client; `preview`/`production` build APKs.

## TypeScript / Metro

- `tsconfig.json` extends the Expo base; `node_modules` and `astra-cli`
  excluded. Verify with `npx tsc --noEmit` (must be clean).
- `metro.config.js` shims Node builtins (`fs`, `os`, `path`, `crypto`,
  `inspector`, `perf_hooks`) via `metro-shims/empty.js` for the in-WebView
  TypeScript compiler.
