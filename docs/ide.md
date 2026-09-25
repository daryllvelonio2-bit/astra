# IDE

`src/ide/` holds the workspace UI. `src/theme/` holds the global theme
(`themeContext.tsx`, `useOrientation.ts`). App navigation lives in `App.tsx`
(picker / editor; the editor stays mounted once opened so PTY sessions
survive navigation).

## Workspaces

- **Location:** app-private `workspaces/` under `FileSystem.documentDirectory`
  (`workspaceService.ts`, `storagePaths.ts`). Platform-aware quick paths and
  picker defaults live in `storagePaths.ts`.
- **Registry:** `workspaces_registry.json` maps `id → { name, dirPath,
  template?, createdAt }`. `listWorkspaces()` unions the directory scan with
  registry keys.
- **Custom locations:** `createWorkspace(name, customPath?)` creates a folder
  inside a chosen parent; `openExistingDirectoryAsProject(dirPath)` registers
  an existing directory (e.g. `/sdcard/...`, cloned repos) in place.
- **Loading:** `loadWorkspace()` recursively scans to depth 6, skipping
  `node_modules`, `vendor`, `.git`, `dist`, `build`, caches, and dotfiles
  (except `.env`/`.gitignore`), yielding to the event loop every 12
  directories, with a 45s timeout. File bodies load lazily on open.
- **Reactivity:** mutations call `notifyWorkspaceChanged()`; explorers
  refresh via `subscribeWorkspaceChanges` / `useWorkspaceAutoRefresh`.
- **FS layer** (`nativeFs.ts`): sync-native-first through `linux-runner`,
  expo-file-system as a 3s-raced fallback; external paths (outside the app
  sandbox) always go native.

## Project picker

`ProjectPicker.tsx` lists workspace metas as cards (`ProjectCard.tsx`) with
search, backed by `listWorkspaceMetas()`. Creation and opening go through
modals:

- `CreateProjectModal.tsx` — name + Default Storage / Specific Directory
  toggle; keyboard-aware bottom sheet (lifts above the soft keyboard,
  auto-scrolls the focused field).
- `DirectoryPickerModal.tsx` — on-device directory browser with quick jumps
  (`/sdcard/...` on Android only), typed-path entry, and inline folder creation.
- `CloneRepoModal.tsx` — clone any GitHub URL or `user/repo` shorthand over
  HTTPS/SSH, with inline token/SSH-key auth recovery and live progress.
- `ProjectInspectorModal.tsx` — details, open, and destructive delete
  (deletes the directory).

## Editor tab

- `EditorView.tsx` — virtualized viewer (`WINDOW_SIZE = 100` lines) hosting
  `CodeMirrorEditorView.tsx`, which runs CodeMirror 6 inside a WebView
  (offline bundle from `scripts/build-codemirror-html.js`).
  `MonacoEngineHost.tsx` provides a secondary highlight engine for
  non-plaintext files.
- `CodeSyntaxHighlighter.tsx` + `syntaxTokenizer.ts` — regex tokenizer with
  separate dark/light palettes; `codeDiagnosticsService.ts` — bracket
  matching and error/warning analysis shown in `ProblemsPanel.tsx`.
- `EditorTabBar.tsx` — file title, edit/view badge, problem counts, format,
  run, and the ⋮ overflow menu.
- `FileExplorer.tsx` (+ `fileExplorerUtils`, `useFileDragDrop`,
  `useWorkspaceFileActions`, `useSidebarResizer`, `FileActionModal`) —
  tree with expand/collapse, inline create, drag-drop move, long-press
  actions, animated resizable sidebar.
- `chatFileLinkService.ts` — normalizes `file://`/PRoot/workspace paths to
  workspace-relative paths; `ideActionService.ts` is the event bus used to
  open files, browser URLs, the terminal, or switch tabs.
- **Run button** (`runService.ts`) — saves the file, then executes it in the
  on-device Debian guest: `.html` is served (`http.server`) and opened in
  the Browser tab; `.js/.py/.ts`, C/C++/Go/Rust/Java/Ruby/Lua/shell/SQL
  run directly with the guest toolchain; unknown files fall back to project
  detection (`package.json` start/main, Django `runserver`,
  `app.py`/`main.py`, `go.mod`, `Cargo.toml`, `index.html`). Output streams
  into the Terminal tab's dedicated ▶ Run session (`RUN_IN_TERMINAL` action,
  `useRunSession.ts`). Nothing is auto-installed: a missing runtime shows
  the real shell error plus a pointer to Optional Extras.

## Terminal tab

- `TerminalView.tsx` — multi-session host; `useTerminalSession.ts` owns
  session state, history folding, clipboard, zoom, and task-tab sync.
- **PTY shell sessions** render with xterm.js (`XtermView.tsx`, offline HTML
  built by `scripts/build-xterm-html.js`); **task tabs** use the legacy
  `AnsiRenderer` scrollback. Gated by `PTY_XTERM_ENABLED` (`ptyConfig.ts`).
- `ExtraKeysBar.tsx` — Termux-style ESC/TAB/CTRL/ALT/arrows + symbols with
  sticky modifiers; the shortcut row pins itself above the soft keyboard.
- `TerminalHeader.tsx` — session tabs, restart/clear, theme picker, zoom,
  copy/paste. `terminalBuffer.ts` — 100k cap, honest history merging, and the
  ASTRA fastfetch-style banner. `terminalThemes.ts` — independent terminal
  color schemes (follow the app theme mode by default).

## Browser tab

`WebBrowserPreview.tsx` — WebView with nav bar, running-task port chips,
and error view. Localhost URLs are normalized; dev servers started in the
terminal are detected (`runningTasksInspect.ts`) and can auto-open here.

## Git tab

A GitHub-Desktop-style client backed by the guest `git` binary:

- `GitHubDesktopView.tsx` — responsive container (side-by-side in landscape,
  master-detail in portrait) composing header, changes, history, diff, and
  branch/credentials/remote modals.
- `gitService.ts` — status, stage/unstage, commit, log/show, branches,
  fetch/pull/push, remotes, credentials, SSH key management (plus
  `gitStatusCache.ts` for the 2s status cache,
  `gitRemoteService.ts` for auth/remote ops).
- `GitChangesList.tsx` — file staging + AI-generated commit summary
  (`gitCommitSummary.ts`, uses your own Gemini key) with a keyboard-aware
  commit box; `GitDiffViewer.tsx` + `diffParser.ts` — unified diff with
  dual gutters; `GitHistoryList.tsx`, `GitCommitFilesList.tsx`,
  `GitBranchModal.tsx`, `GitRemoteModal.tsx`.
- `gitCloneService.ts` — non-interactive clone with auth-error detection;
  `GitCredentialsModal.tsx` with `GitBrowserLoginTab` (OAuth/PKCE),
  `GitTokenTab` (fine-grained PAT) and `GitSshKeyTab` (ed25519) onboarding.

## Bottom navigation

`IDEBottomBar.tsx` — Editor / Terminal / Browser / Git. Visibility is
user-configurable, see [configuration](configuration.md).

## Settings

`SettingsModal.tsx` — tabbed sheet (`SettingsTabBar.tsx`) with debounced
autosave and a Saved indicator:

| Tab | Contents |
|---|---|
| General | `GeneralSection` — theme (dark / light / midnight), Gemini keys, bottom-tab toggles, keyboard/mouse mode |
| Editor | `EditorSection` — tab size, auto-close, indent, completions, format-on-save, indent guides, font size |
| Linux | `EnvironmentSection` — toolchain stages, live APT log, binary health, opencode repair, Optional Extras |

All values persist in `config.json` via `configService.ts`.

**Optional Extras** (`OptionalPackagesSection`, catalog in
`optionalPackages.ts`): two halves. **Required for Astra to work**
(`REQUIRED_GROUPS`, mirroring the native stages: core shell/tools, built-in
runtimes, build tools) lists every base package with *why the app needs it*,
probed via `command -v` or `dpkg-query -W` for header-only packages — verify or
reinstall each by hand. **Optional Extras** holds one-tap boosts in 4
groups (CLI Power Tools, Extra Languages, Database Clients, Media & Docs).
An **Auto-download toolchain** switch (persisted natively in
`SharedPreferences`, enforced in `ToolchainProvisioner.ensure()`, manual
Re-download bypasses via `force=true`) makes every download a user choice:
off means nothing downloads until tapped below. Installs reuse the existing
`installPackages` bridge, heavy downloads show a LARGE badge + storage
confirm, and installs are blocked while background provisioning holds the
apt lock. Package names are pinned to Debian bookworm:
`redis-server`+`redis-tools`, `mariadb-client` (not
`mysql-client`), `postgresql-client`, `golang-go` (not
`go`), `rustc`+`cargo`, `openjdk-17-jdk`, `build-essential`
(not `build-base`), `python3-pip` (not `py3-pip`). No MongoDB
shell ships in bookworm; `bat` runs as `batcat`; `magick` is `convert`.

## Theming

Every component styles through `useTheme()` tokens (`bg*`, `text*`,
`accent*`, borders, overlays) — no hardcoded colors. `useOrientation()`
drives landscape-compact bars and the collapsible sidebar. Syntax colors
(`syntaxTokenizer.ts`) and terminal themes (`terminalThemes.ts`) are the
only separate palettes, both with dark/light variants.