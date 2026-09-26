# Astra Gap Analysis — Usability & Functionality

Verified against the codebase (250 source files) on 2026-09-26. Each gap was
confirmed by grepping the source, not speculation. Priorities are my
recommendation for a daily-driver phone IDE.

## Functionality

- [x] **1. Find & replace in the editor** — done 2026-09-26 (Phase 1: CM search panel, top-docked, ⋯ entry + Ctrl/Cmd+F).
- [x] **2. Search across the project** — done 2026-09-26 (Phase 2: guest rg→grep, bottom-sheet results, tap-to-jump).
- [x] **3. Merge conflict handling** — done 2026-09-26 (Phase 3: conflict banner + badges + ours/theirs resolve + abort/complete, friendly pull message).
- [ ] **4. Git stash / rebase UI** — cherry-pick exists, these do not.
  *(Medium)*
- [x] **5. File watcher** — done 2026-09-26 (Phase 4: existing 2.5s poll verified + hardened — depth-8 FNV fingerprint, cycle guard, order-independent).
- [x] **6. Error boundaries** — done 2026-09-26 (Phase 5: per-panel boundaries with themed retry fallback; corrected — a root boundary in `App.tsx` already existed, the gap was panel scope).
- [ ] **7. Terminal scrollback search / copy-mode** — long output is hard to
  navigate on a phone. *(Medium)*
- [ ] **8. Autosave + duplicate-tab guard** — no autosave, no detection when
  the same file opens in two tabs. *(Medium)*
- [ ] **9. Deeper LSP surface** — thin `nativeLspService` + `useEditorAssists`
  only; no go-to-definition / rename / refactor. *(Medium)*
- [ ] **10. Debugger / REPL flow** — none (understandable on-device, but no
  run-and-inspect alternative either). *(Low)*

## Usability

- [ ] **1. Accessibility** — zero `accessibilityLabel` / `accessibilityRole`
  hits; TalkBack is silent app-wide. *(Medium)*
- [x] **2. Shortcut discoverability** — done 2026-09-26 (Phase 6: Settings → Keys tab; 20 entries all machine-verified against the bundled keymaps + tab switcher, with touch equivalents where they exist).
- [ ] **3. Touch-first editing** — no multi-cursor, go-to-line, or
  go-to-symbol; undo/redo has no visible touch affordance. *(High)*
- [ ] **4. Onboarding** — only a theme-selection step; no explanation of the
  Debian terminal or Run workflow for first-timers. *(Medium)*
- [ ] **5. i18n** — English hardcoded (minor for a solo user). *(Low)*
- [ ] **6. Workspace export / share / backup** — no zip-to-Files or share.
  *(Medium)*
- [ ] **7. Progress on long operations away from the tab** — 45s scan, clones,
  installs have partial progress but no global notification affordance.
  *(Low)*

## Suggested order of attack

~~find/replace → global search → merge conflicts → file watcher → error
boundaries~~ (done 2026-09-26) → shortcut help — error boundaries is already required by agents.md.
