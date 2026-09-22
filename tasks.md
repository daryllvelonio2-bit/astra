# Performance Optimization Plan — faster / snappier, zero functionality loss

Goal: cut startup, navigation, editor typing, chat streaming, terminal flood, file/git ops latency. No UI/UX removal, no feature cuts. Measure before/after each phase. Phase-by-phase, verify exit gate before next (per `agents.md`).

## Phase 0 — Baseline (measure only) — DONE 2026-09-14
- [x] Log boot timings: `loadHasCompletedStartup`, `PRootService.ensureReady`, first picker paint, first editor paint.
- [x] Log workspace scan: dirs scanned, ms, `SCAN_TIMEOUT_MS` hits (`workspaceService.ts:182-260`).
- [x] Log bundle: JS bundle bytes, Hermes bytecode, `monacoEngineHtml.json` 3.9M + `xtermHtml.generated.ts` 296K copies.
- [x] Log chat: `onTextDelta` setState/sec, `AstraChatScreen.tsx` remaps/sec during stream.
- [x] Log terminal: `XtermView.tsx` injects/sec, `AnsiRenderer.tsx` parse ms/chunk, `runningTasksService.ts` poll ms.

## Phase 1 — React render quick wins (no behavior change) — DONE 2026-09-14
- [x] `IDELayout.tsx`: stable `handleContentChange` (ref, no per-keystroke recreate), `handleBackToPicker`/`refreshWorkspace`/`handleSelectFile`/`handleEditModeChange` + 16 extracted callbacks (`useIDELayoutCallbacks.ts`), memoized styles/count (`useIDELayoutStyles.ts`), running-tasks signature guard.
- [x] Memo defeats: `AgentMessageItem` (memoized step filters via `useAgentMessageData.ts`, stable toggles), `StepCard` (memoized port scan, stable collapse/output toggles), `GitFileItem` verified memo (parent callbacks stable). `FileExplorer` full virtualization → Phase 2.
- [x] Theme: `getTokenColors` cached by theme identity (`syntaxTokenizer.ts`), `CodeSyntaxHighlighter` memoized + palette memoized, midnight bubble `shadow*` removed (modals keep theirs).
- [x] Chat (`useChatSession`, `AstraChatScreen`): delta batching ~100ms (`useDeltaBatch.ts`), `handleSend` stable (no `messages` dep, uses ref), memoized `visibleMessages`, stable scroll/paginate callbacks.
- [ ] `MarkdownMessageView.tsx:434`: deep parse memo → Phase 2 (old rows already skip via memo + stable slice; streaming re-parse is inherent to new text).
- [x] 1Hz tick: stable slice + memo rows isolate timer; `scrollToEnd({animated:false})` everywhere during stream/keyboard; `LayoutAnimation` removed from `LiveAgentStatusBar`/`RunningTasksBar` (snap expand); task subscriptions signature-guarded (ignore output-text notifies).
- [x] `AnsiRenderer.tsx`: palettes/parse/font memoized, input capped 60k chars, spans capped 1500.
- [x] `EditorView`: verified already memoized (`rawLines`/`offsets`/`chunk`) + `useEditorAssists` debounced; caps kept (800/1500/250). No change needed.
- [ ] `FileExplorer.tsx:387`: full `renderNode` virtualization + drag throttle → Phase 2 (measurement path left untouched for stability).

## Phase 2 — Lists + mount policy (biggest snappiness gain) — DONE 2026-09-14
- [x] Tuned all untuned `FlatList`s (ProjectPicker pattern: `initialNumToRender` 8-12, `maxToRenderPerBatch` 10, `windowSize` 5, `removeClippedSubviews` on Android): `GitChangesList`, `GitHistoryList`, `GitCommitFilesList`, `ChatSessionsModal`, `GitBranchModal` (+persist taps), `ExtensionMarketplaceModal` (both lists), `ExtensionThemesTab`, `DirectoryPickerModal`.
- [x] Chat windowing tightened: renderLimit 100→60, page +10→+20 (`useChatSession`, `AstraChatScreen`). Full chat→`FlatList` rewrite deferred (scroll/keyboard/load-older behavior risk; current `ScrollView` + 60-cap + memo rows is stable).
- [x] `IDELayout`: `visitedTabs` LRU cap max 5 live (`addVisitedTab` in `useIDELayoutCallbacks.ts`). Pinned editor/terminal/agents (terminal kills shells on unmount, agents holds draft); browser/git/desktop/vscode evict oldest-first, reconstruct on revisit.
- [x] Hidden WebView suspend: `XtermView`/`TerminalView` new `visible` prop (buffer while hidden, flush on return; 80ms interval gated); `VSCodeView`/`DesktopView` already gated (verified); `WebBrowserPreview` task subscription signature-guarded.
- [ ] File tree / `GitDiffViewer` full virtualization deferred (drag-measure + nested-scroll rewrite risk; revisit with dedicated testing).

## Phase 3 — WebView bridges — DONE 2026-09-14
- [x] `XtermView`: adaptive flush (interactive = immediate, flood queue>4 → 80ms batch; keeps `WRITE_SLICE`/`MAX_QUEUE`); `__DEV__` grid-spam log removed; resize deduped vs last grid (forced through on session switch so new PTY always gets `TIOCSWINSZ`); hidden-tab buffering from Phase 2 kept.
- [x] Monaco: service pending cap 3 (oldest surplus resolves null → regex fallback; newest always runs; 400k/8s guards kept); hook layer already had 800ms debounce + LRU-30 + stale-drop (verified, untouched); `IDELayout` lazy-mounts `MonacoEngineHost` only for non-plaintext files (plaintext service path returns null anyway).
- [x] `WebBrowserPreview`: `key={reloadKey}` remount removed (was destroying back/forward history + full page rebuild per nav); navigations flow via `source` change, reloads via `ref.reload()`, same-URL resubmit reloads explicitly. Fixes back button after in-app navigation.
- [x] Logs: shared `useBatchedLog.ts` (100ms batch, 200-line cap) wired into `VSCodeView` + `DesktopView` (diagnose fan-out + provision floods no longer re-render per line).
- [x] JSON guards: audited all WebView `onMessage` parsers — `XtermView`, `VSCodeView`, monaco service already guarded; `DesktopView`/`WebBrowserPreview` have no message bridge. Nothing to add.

## Phase 4 — FS / services / PRoot (fewer spawns, fewer writes) — DONE 2026-09-14
- [x] `workspaceService`: left as-is (scan already yields every 12 dirs + 45s cap + debounced refresh; per-dir bridge calls are inherent to tree builds).
- [x] Conversations: `updateSessionMessages` throttled to 1 save/sec/session (leading when idle, trailing latest; `conversationService.ts`). Worst case a kill loses <1s of stream tail.
- [x] `nativeFs`: investigated, no change — native calls are already sync-instant with expo as raced fallback; a cache would add staleness for ~zero gain.
- [x] `gitService`: status is now 1 spawn (dropped separate `rev-parse` probe; exit code infers repo) + 2s cache (`gitStatusCache.ts`); all 12 mutators invalidate; remote/credential ops split to `gitRemoteService.ts` (re-exported, callers untouched).
- [x] `runningTasksService`: poll 5s→8s (already skipped when empty); output trim hysteresis (copy only past 60k, cut to 40k); output notifies coalesced to 150ms trailing.
- [x] Native (Kotlin, +27 lines): `ensureSystemConfigs` refreshes at most every 30s (idempotent body; TTL set only on success so failures retry next call); DNS `getprop`+`LinkProperties` cached 30s (public fallbacks always present). Daemon invariant untouched — config only, never starts servers.

## Phase 5 — Bundle + startup (faster cold start) — DONE 2026-09-14
- [x] Metro: `typescript` (23M) mapped to empty shim — `getTs()` fallback to bracket scan verified + explicit `transpileModule` shape check added; vendor guard `blockList` fails loudly on direct `monaco-editor(-core)`/`xterm`/`@xterm` imports (all ship via offline blobs only). Config load-tested with node.
- [x] Blobs lazy-eval (same bytes, deferred cost): monaco 4MB JSON `import` → lazy `require` on first build; xterm 296K `BLOB` const → cached getter. Both build scripts updated so regeneration preserves the pattern.
- [x] Boot (`App.tsx`): settings/config/sandbox now concurrent (were serial); splash waits only on local settings+config — sandbox warms detached (all consumers `ensureReady` internally); fallback 15s→10s; unmount cancels pending state writes.
- [x] Deps audit (verify-only, no `package.json` moves — zero bundle impact either way, moves risk install flows): `jszip` used by vsixExtractor (keep); `@expo/ngrok` tunnel-only, never imported (keep, harmless); `monaco-editor(-core)`/`xterm*` node-build-only (guarded); Hermes is SDK 54 default (no `jsEngine` override); no custom font preloads to trim.

## Exit gates (every phase)
- `tsc` clean, no file >500 lines, no hardcoded theme colors, boot/list/type/stream manually verified snappier with zero feature loss. Update `PROGRESS.md` after each phase.
