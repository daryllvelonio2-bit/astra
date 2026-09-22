# Getting Started

## Requirements

- **Node.js** with `npx` (Expo SDK 54, React Native 0.81, React 19).
- **Android SDK + JDK 17** for APK builds (the one-shot script installs Temurin JDK 17, cmdline-tools, platform-tools, API 34, Gradle 8.14.3, NDK r27b).
- A **physical Android device** with USB debugging (the app is Android-only; `linux-runner` sets `platforms: ["android"]`).
- A **Gemini API key** for the agent and voice transcription (Settings → Keys).

## First-time machine setup

```sh
./setup-linux-assets.sh   # downloads Debian bookworm-slim rootfs (aarch64 + x86_64)
                          # from Docker Hub into android/app/src/main/assets/linux/
./build-local-apk.sh      # one-shot toolchain bootstrap, then assembleRelease
```

## Daily development loop

```sh
./start-debug.sh          # adb reverse 8081, Metro in an external terminal, launches the app
# or, step by step:
./metro.sh                # adb reverse + npx expo start --dev-client --clear
./build-debug-apk.sh      # assembleDebug, adb install -r, auto-launch MainActivity
```

Metro **must** run in a dedicated external terminal (`metro.sh` opens
foot/kitty/xterm detached) — never inside the agent session.

## Rebuild vs. Metro reload

| Changed | Action needed |
|---|---|
| JS/TS in `App/`, `src/`, generated xterm bundle | Metro reload only |
| `modules/*/android` (`.kt`, `.c`, `CMakeLists.txt`), `app.json` native config, bundled assets | Full `./build-debug-apk.sh` + reinstall |

## First launch checklist

1. Install + open the app; the Debian toolchain provisions in the background (watch Settings → Linux tab for live stage progress).
2. Add a Gemini API key in Settings → Keys, pick a model in Settings → Model.
3. Create a workspace (or clone a repo) from the Workspaces picker.
4. Open the Terminal tab — you should see the ASTRA banner and an `astra:` prompt.

## Project scripts

| Script | Purpose |
|---|---|
| `build-debug-apk.sh` | `assembleDebug` → install → launch (JDK/SDK env, single Gradle worker) |
| `build-local-apk.sh` | Bootstrap JDK/SDK/Gradle/NDK, then `assembleRelease` |
| `start-debug.sh` | Reverse ADB, Metro in external terminal, launch app |
| `metro.sh` | `adb reverse` + `expo start --dev-client --clear` |
| `setup-linux-assets.sh` | Fetch Debian rootfs into APK assets (proot binaries are vendored) |
| `scripts/build-xterm-html.js` | Inline xterm.js + fit addon + CSS into `xtermHtml.generated.ts` (re-run after xterm upgrades) |

`package.json` only defines `start`, `android`, `ios`, `web` — all real workflows go through the shell scripts above.
