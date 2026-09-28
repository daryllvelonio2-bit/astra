# Astra Feature-Gap Audit — 2026-09-29

Deeper pass over the GitHub suite + manual-coding surfaces (supersedes the
2026-09-26 file's overlapping items; that file keeps its own history).
Verified against source (tsc + grep + 4 audit passes). Checkboxes = not yet
fixed. Evidence names the exact file/function/grep count behind each item.

## Suggested order
1. Phase A items (dead routes, touch undo/redo, touch comment/save) — plumbing
   already exists, small effort, unlocks built-but-unreachable features.
2. Phase B items (PR review submit, reactions, gist writes) — service-layer
   additions, one file per feature per agents.md Rule 6.
3. Engine items (autocomplete, bracket match, wrap) — CM bundle regeneration.

## Phase A — IDE manual coding

- [ ] Touch undo/redo triggers: engine exposes `__cmUndo`/`__cmRedo` via
  CodeMirrorEditorView undo()/redo() imperative handle, ZERO callers (verified:
  2 grep hits = definitions only). Add menu/TabBar actions or RN shortcut.
- [ ] Touch comment toggle + selection ops (select line/word/all, duplicate
  line): absent from EditorTabBar menuActions + gestures; hardware-kbd only.
- [ ] Real language intelligence: nativeLspService.ts is diagnostics-ONLY
  (runBackgroundDiagnostics + parseUniversalDiagnostics) — no completion,
  hover, definition, references, rename anywhere in ide/ (0 grep hits).
- [ ] Manual save button + saved/saving indicator: autosave-only (700ms
  useDebouncedFileSave, flush exists on switch/unmount) + bare dirty dot in
  title bar.
- [ ] Actions menu has zero code actions: menuActions = Search in Project /
  Find & Replace / Settings / Import / Export / Delete File / Exit Project;
  format hook (onFormat -> useEditorFormatting) exists but unreachable.
- [ ] CRLF/BOM/encoding + trailing-whitespace handling on save: saveFileContent
  plain string write, no detect/preserve/pick anywhere.
- [ ] Editor clipboard not wired to system clipboard: clipboardService used by
  terminal + git UIs only, zero imports in editor components.
- [ ] Symbol outline / breadcrumbs: absent (title bar = workspace/file only).
- [ ] RN keyboard shortcuts: useKeyboardShortcuts registers only Ctrl+E/T/B/G
  tab switches; no save/find/undo at RN level; Ctrl+T/B/G hijacked from editor.
- [ ] Go-to-line has no touch-reachable dialog: __cmJumpToLine engine exists
  (used for search-result + first-error jumps) but no input UI.
- [ ] No markdown syntax highlighting: no @codemirror/lang-markdown in
  node_modules or entry imports (entry maps py/js/ts/tsx/jsx/html/css/json).

## Phase B — GitHub suite

- [ ] Dead routes — notifications, newIssue, newPull, createRelease have
  renderer cases but ZERO push call sites (verified); no entry point to inbox,
  issue/PR/release creation. newGist is a stub EmptyState pointing to github.com.
- [ ] PR review submission: no approve/request-changes/comment-submit (no POST
  /pulls/{n}/reviews), no inline review comments (create/reply/dismiss), no
  per-PR CI checks (check-runs/statuses; only repo-level Actions runs), no
  merge-method choice (fixed method when mergeable).
- [ ] Reactions on issues/PRs/comments: zero /reactions coverage (verified).
- [ ] Gist writes: reads only — no create/edit/delete/star/fork/comment
  (verified: 0 hits).
- [ ] Releases create-only: no edit/delete (no PATCH/DELETE /releases/{id}), no
  in-app asset list/download (browser fallback).
- [ ] pulls filter collapse: mine/review/all lost (maps to open unless closed);
  Home's "PRs to review" search has no matching in-app list.
- [ ] Issue timeline/events + cross-references: absent (comments only).
- [ ] Tags: no list/create (no /tags or /git/refs/tags calls); no
  compare-between-refs (/compare/).
- [ ] Star/fork/watch one-way fire-and-forget: watchRepo PUT subscription only,
  no unwatch/state read (verified); no fork picker; branch picker
  replace-navigates to commits instead of switching the code-tab ref (loses
  repo context).
- [ ] Notifications: no participating/since filters, no per-row mark-read
  button (mark happens implicitly on tap), no thread unsubscribe.
- [ ] Org: no org details (GET /orgs/{org}) or teams endpoints.
- [ ] Search: no filter UI beyond scope tabs (no language/stars/label);
  code results lack ref/branch info.
- [ ] myRepos empty-state hint references a home 3-dot menu that doesn't exist.
- [ ] GITHUB_SCOPES const stale: omits delete_repo + workflow scopes the auth
  flow requests (gitHubTypes.ts:298).

## Cross-cutting

- [ ] fetchContributionCalendar bypasses ghGraphQL helper (direct ghPost
  /graphql) — ghGraphQL has exactly 1 caller (fetchTreeCommits).

## Fixed by this audit (2026-09-29)

- [x] gitCommitSummary.ts: broken imports after cleanup (loadApiKey/
  loadSelectedModel removed) — now reads via loadConfig; tsc green; committed
  25a4e55.
