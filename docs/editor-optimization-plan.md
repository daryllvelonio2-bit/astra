# Editor Tab Optimization Plan

Measured on current `main` (CodeMirror era), 2026-09-26. Every claim below was
verified against the code — file:line refs included so each step is checkable.

## Why the editor "opens slow" when other tabs don't

Terminal/Browser/Git are plain React Native views: mount = a few ms of JS.
The editor is a **Chromium WebView booting a 606 KB CodeMirror app**, and it
pays for it serially at the worst moments:

| Cost | Where | Measured/Verified |
|---|---|---|
| C1: second WebView + 3.8 MB payload for a **dead** highlight engine | `MonacoEngineHost` mounted at `IDELayout.tsx:380`; `monacoEngineHtml.json` is 3.8 MB, `require()`d from Metro on first code-file open; its only consumer `useMonacoHighlight` is imported by **no one** — CodeMirror highlights now, nothing calls the engine | `grep` shows zero consumers besides the dead hook |
| C2: 606 KB CM blob inside the Metro bundle | `editor/codemirrorHtml.generated.ts` (616 KB source, one giant string); esbuild metafile breakdown: view 189 + state 46 + autocomplete 34 + search 20 + lezer parsers 160 + langs 35 KB | `esbuild --metafile` output, this session |
| C3: full workspace tree re-scan on **every tab switch** to editor | `IDELayout.tsx:235` `if (bottomTab === "editor") refreshWorkspace()` → `loadWorkspace` walks the whole tree over the native bridge + reads active file from disk | code read |
| C4: editor is the **default tab** — WebView boot competes with project entry | `IDELayout.tsx:57` initial `bottomTab = "editor"`, visitedTabs seeded with it (`:58`) | code read |
| C5: per-keystroke full re-render | `handleContentChange` (`IDELayout.tsx:261`) does `setActiveFile` (re-renders the entire IDE tree incl. FileExplorer) **+** `recordRecentFile` (second setState → another full render) on every character | code read |
| C6: dead assist/completion tree still bundled + diagnostics on content change | `useEditorCompletions`, `CompletionBar`, `completionService`, `CodeSyntaxHighlighter`, `EditorEditRow`, `ContinuationSplitView`, `useDebouncedTokens` — zero live importers; `useEditorAssists` runs per content change (debounce not verified) | `grep` import sweep |

## Phase 1 — delete the dead Monaco second WebView (biggest single win)

Removes C1 entirely: one WebView instance, 3.8 MB dev-server fetch, and the
`monacoLangForFile(...) !== "plaintext"` mount at every editor render.

Delete (after a final `grep -r` guard for each):
- `src/ide/components/editor/MonacoEngineHost.tsx`
- `src/ide/components/editor/monacoEngineHtml.generated.ts` + `monacoEngineHtml.json` (3.8 MB)
- `src/ide/services/monaco/monacoEngineService.ts`, `monacoLanguageMap.ts`
- `src/ide/components/useMonacoHighlight.ts`
- `scripts/build-monaco-html.js`, `scripts/monaco-engine.js`, `scripts/monaco-languages-entry.js`
- the mount + imports in `IDELayout.tsx` (`:9`, `:32`, `:380`)

Keep `src/ide/services/syntaxTokenizer.ts` — `themeAdapter.ts` (live, marketplace
themes) imports its `TokenType`/palette, and CM language detection stays in
`codemirror-entry.js`.

Also sweep C6's zero-importer files in the same commit:
`CodeSyntaxHighlighter.tsx`, `EditorEditRow.tsx`, `ContinuationSplitView.tsx`,
`useDebouncedTokens.ts`, `indentGuideUtils.ts` (check its importers first),
`editor/useEditorCompletions.ts`, `editor/CompletionBar.tsx`,
`completionService.ts` — **but** verify `useEditorAssists` still gets what it
needs (it renders diagnostics; keep its data path).

## Phase 2 — stop paying for the tree on every tab switch (fixes C3)

Switching *back* to Editor should be instant — the WebView is already alive
(kept mounted via `visitedTabs` + `display:none`). Make `refreshWorkspace` on
`bottomTab === "editor"` lazy:

- Replace the synchronous effect with a background refresh that does **not**
  await before showing the tab: fire `loadWorkspace` off the interaction
  (`InteractionManager.runAfterInteractions`), update state when it lands.
  The tab contents (CM instance) don't depend on the tree at all; only the
  FileExplorer sidebar does.
- Skip the re-scan entirely when nothing could have changed: dirty-flag the
  workspace on save, clear on refresh; require it to be >2 s since last scan.
- Same for the active-file disk re-read (`IDELayout.tsx:212`): already gated
  by the 3 s local-edit guard; extend the gate to also skip when the
  autosave timer had a pending buffer for that path (we know its exact bytes).

## Phase 3 — boot the WebView while the user still looks at the picker (fixes C4)

Cold-starting the CM WebView (~1–2 s: renderer spawn + eval) is unavoidable
once; make sure it happens **before** it's needed, never during:

- Keep editor as default tab (no UX change), but defer the actual
  `<CodeMirrorEditorView>` mount with `InteractionManager.runAfterInteractions`
  + one `requestAnimationFrame` so boot-critical RN renders (picker fade,
  layout) finish first; render an `ActivityIndicator` skeleton in its place
  for the moment. This alone makes the transition *feel* like the other tabs.
- Cache the built HTML string at module scope (`buildCodeMirrorHtml` currently
  re-runs `replaceAll` over 616 KB on every new mount of the editor view;
  `useRef` only helps within one mount). One shared blob string, keyed by
  `bg|isDark` — theme changes are rare, cache size stays 1–2.
- Don't change `source` identity: `source` is `useMemo`d on `html` ref — fine;
  the blob-cache above keeps that stable across re-mounts.

## Phase 4 — cut the 606 KB payload honestly (fixes C2)

From the esbuild metafile (minified): `@codemirror/view` 189 KB and
`@codemirror/state` 46 KB are mandatory. The optional chunks:

- **autocomplete 34 KB + search 20 KB + lint 11 KB (65 KB):** `codemirror-entry.js`
  uses `basicSetup` which bundles them; entry registers **zero** completion
  sources (verified: `grep autocompletion` in entry = 0) and lint is unused.
  Replace `basicSetup` with an explicit minimal setup (line numbers, history,
  fold, draw-selection, keymap minus `closeBrackets`/`autocompletion`) → saves
  ~65 KB minified, and trims the per-keystroke work (no completion trigger on
  every input). Keep search only if UI exists for it — it doesn't → drop.
- **Unused language parsers:** java/xml are already lazy-chunked via
  `monaco-languages-entry.js`? (that build script dies with Phase 1 — port the
  same lazy `import()` pattern to CM: keep js/ts/json/py inline ≈140 KB, move
  html/css data-URL sub-parsers behind a runtime chunk loaded only when such a
  file opens.) Low priority: ~50 KB saved.
- Ship the final blob **as a raw asset** (`text/` via expo-asset or an
  `.html` require), not a 616 KB JS string: Metro stops parsing it as JS, dev
  bundle drops ~0.6 MB, and hot-reload no longer re-evals it. This is the C2
  structural fix; the string-in-JS was only ever a dev-server shortcut.

Order matters: Phase 3's module-level cache + asset loading makes Phase 2 of
C2 (dev-mode cost) moot on top.

## Phase 5 — per-keystroke render cost (fixes C5, "editor stays slow")

- Remove `recordRecentFile` from `handleContentChange`; call it on: file open,
  first edit of a burst (ref guard), and on scheduled-save flush (it already
  fires from the save path — verify). Kills one full-tree render per char.
- `setActiveFile` per keystroke re-renders FileExplorer + Git tab too.
  Split: keep an `activeFileRef` as source of truth for content (already
  exists for save-path decisions), and only publish the *content* into React
  state via a cheap `contentVersion` counter consumed by who actually needs
  it (title bar dot for dirty state, status bar). CM is already
  source-of-truth (anti-echo logic) — nothing else needs the full string
  synchronously. This keeps `EditorView` memoization useful instead of
  defeated by a new object identity every char.
- Verify `useEditorAssists(content, ...)` debounce internally (it drives
  diagnostics on every content change; if it's not debounced, add a 400 ms
  trailing debounce before `runBackgroundDiagnostics`).

## Phase 6 — editor must respect the global theme (Midnight Glow bug)

Current behavior, verified in `codemirrorHtml.generated.ts`:
`__cmSetTheme(dark, bgPrimary)` only (a) swaps the **hard-coded `oneDark`**
theme for a light default, (b) sets `--gutter-bg` to literal `#282c34`/`#f6f8fa`,
(c) paints `document.body` with `bgPrimary`. Result: under Midnight Glow (or
any dark marketplace theme) the code area keeps one-dark's palette + gutters —
it "ignores the theme".

- Add a real theme API to the CM entry:
  `__cmSetThemeFull(themeJson)` that builds `EditorView.theme({...})` from the
  global palette — `bgPrimary`, `bgSecondary` (gutter), `textPrimary`,
  `textMuted`, `accent`, plus token colors from the existing
  `syntaxTokenizer` `TOKEN_COLORS_DARK/LIGHT` palette (already consumed by
  `themeAdapter`), mapped to CM highlight tags (keyword/comment/string/
  number/type/function/…). Regenerate blob with
  `node scripts/build-codemirror-html.js`.
- RN side: pass the whole relevant palette (one `JSON.stringify`), not two
  scalars — extend the existing sync `useEffect` dep list to the fields that
  matter (`theme.id`/`theme.name` covers marketplace swaps cheaply).
- Gutter + selection + caret colors from theme (oneDark's `#282c34` selection
  glow currently clashes with non-one-dark palettes).
- Light themes keep working through the same path (no `isDark` special-casing
  beyond tag-palette selection).
- Acceptance: switch between Midnight Glow / any marketplace VS Code theme /
  an light theme; editor bg, gutter, caret, selection, and token colors all
  change without reload, matching the sidebar/tab chrome.

## Phase 7 — measurement, before claiming victory

Add timestamped traces around the open path (remove or gate behind a flag
after):
- `EditorView` mount → WebView `onLoadStart` → `ready` postMessage arrival →
  first content injection → first keystroke change event round-trip.
- `adb logcat` `ReactNativeJS` tags; compare cold project-entry→editor-ready
  before/after. Target: WebView `ready` ≤ 500 ms *after* picker (warm), tab
  switch back ≈ 0 JS work, first keystroke→echo round-trip ≤ 30 ms.
- Dev-only `Performance.now()` delta in the ready handler for CM eval time.

## Sequencing and risk

1. **P1 dead-code removal** — pure delete, typecheck-verified, zero behavior
   risk. Biggest single latency win (3.8 MB network + one WebView). ~30 min.
2. **P6 theme correctness** — user-visible bug, isolated to blob + one effect.
   Needs blob regeneration; re-check the fold-gutter work from `65a0e4c`
   survives regeneration. ~1 h.
3. **P3 warm-boot + cache** — small, contained. ~30 min.
4. **P2 lazy tree refresh** — touches tab-switch effect + dirty gating. Watch
   the FileExplorer refresh contract (it's the *sidebar* that needs the tree).
   ~1 h.
5. **P5 keystroke renders** — the subtle one; the anti-echo design constrains
   how state is republished, test undo/redo/format/file-switch after. ~1–2 h.
6. **P4 payload slim** — do after P6 (theme API changes the blob anyway) so
   regeneration happens once. `basicSetup`→explicit is mechanical; raw-asset
   shipping changes the loader path. ~2 h.
7. **P7 traces** — instrument first commit actually; measure, then decide if
   P4's lazy-chunk language tail is worth the complexity.

Files NOT to touch while optimizing: the anti-echo logic in
`CodeMirrorEditorView` (deliberate, battle-tested), the header/sync Git
surface, and the fold-gutter behavior in the CM entry.
