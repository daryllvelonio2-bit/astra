# Conventions

From `agent.md` / `agents.md` (11 rules, binding on every change):

1. **Zero bloat** — no unused code, deps, or speculative features.
2. **Simplicity first** — smallest change that satisfies the request.
3. **Modular architecture** — one feature per file.
4. **≤500 lines per file** — split before exceeding; check with `wc -l`.
5. **Follow instructions literally** — no hallucinated extras.
6. **Update `PROGRESS.md`** with every change (feature/fix + files + rule compliance).
7. **Debug builds only** — `assembleDebug` / `build-debug-apk.sh` → `app-debug.apk`.
8. **Metro in a dedicated external terminal** (`start-debug.sh` / `metro.sh`), never inside the work session.
9. **Theme tokens only** — all UI colors via `useTheme()`; no hardcoded colors.
10. **Verify with `npx tsc --noEmit`** — must pass with 0 errors before finishing.

## Practical workflow

- JS/TS-only change → Metro reload is enough; confirm `tsc` is clean.
- Native (`modules/*/android`, `app.json` native config, bundled assets) or
  xterm upgrade (regenerate `xtermHtml.generated.ts`) → full
  `./build-debug-apk.sh` + reinstall, then re-verify on device.
- Before committing: `git status`, `git diff`, stage only intended files,
  never commit secrets; only commit/push/PR when explicitly asked.
