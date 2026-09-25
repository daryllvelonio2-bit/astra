# Conventions

From `agents.md` (13 rules, binding on every change):

1. **Zero bloat** — no unused code, deps, or speculative features.
2. **Simplicity first** — smallest change that satisfies the request.
3. **Scalable structure** — clean separation of concerns, easy to extend.
4. **Modular architecture** — one feature per file, for fault isolation.
5. **≤500 lines per file** — split before exceeding; check with `wc -l`.
6. **Follow instructions literally** — no hallucinated extras, no jumping ahead.
7. **Update `PROGRESS.md`** with every change (feature/fix + files + verification).
8. **Debug builds only** — `assembleDebug` / `build-debug-apk.sh` → `app-debug.apk`.
9. **Metro in a dedicated external terminal** (`start-debug.sh` / `metro.sh`), never inside the working shell.
10. **Theme tokens only** — all UI colors via `useTheme()`; no hardcoded colors.
11. **Phase-by-phase execution** — one phase at a time, verify the exit gate, then wait for a go.
12. **Stability & speed first** — no unhandled rejections, cleaned-up timers/subscriptions, correct hook order, memoized hot paths, virtualized lists, I/O off the UI thread.
13. **Verify with `npx tsc --noEmit`** — must pass with 0 errors before finishing.

## Practical workflow

- JS/TS-only change → Metro reload is enough; confirm `tsc` is clean and no
  file crossed 500 lines.
- Native (`modules/*/android`, `app.json` native config, bundled assets) or
  an editor/xterm upgrade (regenerate the corresponding
  `*.generated.ts`) → full `./build-debug-apk.sh` + reinstall, then
  re-verify on device.
- Before committing: `git status`, `git diff`, stage only intended files,
  never commit secrets; only commit/push/PR when explicitly asked.