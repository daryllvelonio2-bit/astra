# Native Modules & Guest Environment

## `modules/linux-runner` (Android, Expo)

The core bridge (`expo.modules.linuxrunner`, `LinuxRunnerModule.kt`):
environment readiness/provisioning status, `initializeEnvironment`,
`executeCommand` / `executeCommandStream` (+ stop), PTY + pipe terminal
sessions, host-side process kills, synchronous file-system ops, storage
permissions, clipboard, and system-overlay control. JS surface is split into
`src/index.ts`, `fileSystem.ts`, `provisioning.ts`, `processKill.ts`.

| Native file | Role |
|---|---|
| `ProcessExecutor.kt` | One-shot guest commands: builds the `proot … /bin/sh -c` argv (binds for Debian dir, workspaces, `/sdcard`, `/storage`), injects guest env, strips proot noise, streams lines, tracks processes for cancellation |
| `ProotSessionConfig.kt` | Single source of truth for interactive sessions; plain `astra:\w# ` prompt, `TERM=xterm-256color` |
| `PtySessionManager.kt` + `PtyNative.kt` + `cpp/pty_session.c` | True PTY via hand-rolled JNI forkpty (`/dev/ptmx`, setsid + `TIOCSCTTY`, Termux-style, no `pty.h`); 4KB reader thread, verbatim CR writes (raw TUIs need CR), `TIOCSWINSZ` + `SIGWINCH` resize, exit watcher, capped history |
| `TerminalSessionManager.kt` | Legacy pipe sessions (reader thread, history cap, CRLF normalization) |
| `EnvironmentManager.kt` | Rootfs/proot extraction per ABI, DNS + shell configs, readiness gate (bash, sh, apt-get, `etc/debian_version`, `astra-cli/bundle/gemini.js`, libproot), Astra CLI provisioning |
| `ToolchainProvisioner.kt` | 4-stage background `apt` toolchain with per-stage timeouts, stoppable process, and progress events surfaced in Settings → Linux |
| `ProcessTreeKiller.kt` | Host-side tree kill via `/proc` PPID snapshots, app-UID only, TERM-then-KILL |
| `EnvironmentAstraHelper.kt` | Unpacks `astra-cli.tar[.gz]` from APK assets into the guest, purges legacy CLIs |
| `NativeFileSystemHelper.kt` | Synchronous read/write/mkdir/move/delete + `MANAGE_EXTERNAL_STORAGE` handling |

## `modules/voice-input` (Android, Expo)

On-device speech via Android `SpeechRecognizer` with a `MediaRecorder`
fallback, surfaced as `start/stop/cancelVoiceListening`,
`start/stop/cancelVoiceRecording`, and `addVoiceListener`.

## Stub modules

- `modules/proot-engine/` — legacy PRoot stub (no `android/` dir), superseded by `linux-runner`.
- `modules/php-engine/` — PHP/Laravel stub (native C++ bridge + iOS podspec present but unwired). Only `linux-runner` and `voice-input` are app dependencies.

## `astra-cli/` payload

The agent runtime: an `astra` wrapper plus a Gemini-CLI fork (`bundle/`
with `gemini.js` + chunks, `builtin/`, `policies/`, docs/examples), a
`gemini-cli-source/` backup, a Linux `agy` binary, and
`antigravity-config-and-skills/` presets. Readiness is gated on
`bundle/gemini.js` existing in the guest. See `ASTRA_AI_GUIDE.md` for
CLI-side docs.

## Provisioning order (first launch)

1. Extract Debian rootfs + proot binary for the device ABI.
2. Write DNS/resolv + shell configs.
3. Unpack the Astra CLI bundle into the guest.
4. Download the 4-stage developer toolchain (Node 20, Python 3,
   C/C++ build tools, git…), with live progress in Settings.
