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
| `ProcessExecutor.kt` | One-shot guest commands: builds the `proot ... /bin/sh -c` argv (binds for Debian dir, workspaces, `/sdcard`, `/storage`), injects guest env, strips proot noise, streams lines, tracks processes for cancellation |
| `ProotSessionConfig.kt` | Single source of truth for interactive sessions; plain `astra:\w# ` prompt, `TERM=xterm-256color` |
| `PtySessionManager.kt` + `PtyNative.kt` + `cpp/pty_session.c` | True PTY via hand-rolled JNI forkpty (`/dev/ptmx`, setsid + `TIOCSCTTY`, Termux-style, no `pty.h`); 4KB reader thread, verbatim CR writes (raw TUIs need CR), `TIOCSWINSZ` + `SIGWINCH` resize, exit watcher, capped history |
| `TerminalSessionManager.kt` | Legacy pipe sessions (reader thread, history cap, CRLF normalization) |
| `EnvironmentManager.kt` | Rootfs/proot extraction per ABI, DNS + shell configs, readiness gate (bash, sh, apt-get, `etc/debian_version`, libproot) |
| `ToolchainProvisioner.kt` | 3-stage background `apt` toolchain with per-stage timeouts, stoppable process, and progress events surfaced in Settings → Linux |
| `ProcessTreeKiller.kt` | Host-side tree kill via `/proc` PPID snapshots, app-UID only, TERM-then-KILL |
| `NativeFileSystemHelper.kt` | Synchronous read/write/mkdir/move/delete + `MANAGE_EXTERNAL_STORAGE` handling |
| `ProotCapabilities.kt` | Per-ABI proot/loader presence and support-lib checks |
| `EnvironmentDnsHelper.kt` | Guest DNS resolution config (TTL-cached system props) |

## Module surface

`modules/` contains only `linux-runner` as a wired app dependency. The
former `php-engine` (embedded PHP/Laravel), `voice-input` (speech), and a
legacy `proot-engine` stub have all been removed.

## Provisioning order (first launch)

1. Extract Debian rootfs + proot binary for the device ABI.
2. Write DNS/resolv + shell configs.
3. Download the 3-stage developer toolchain (Node 20, Python 3, C/C++
   build tools, git...), with live progress in Settings.

Every download is a user choice: the **Auto-download toolchain** switch
(persisted natively in `SharedPreferences`, enforced in
`ToolchainProvisioner.ensure()`) is off by default, so nothing downloads
until asked. A manual Re-download bypasses via `force=true`.