# Architecture

## Layers

```
┌─────────────────────────────────────────────────┐
│  React Native UI  (src/ide, src/ai/components)  │
│  workspaces · editor · terminal · git · chat    │
├─────────────────────────────────────────────────┤
│  JS services  (workspaceService, astraCliService,│
│  gitService, configService, runningTasksService) │
├─────────────────────────────────────────────────┤
│  Expo bridges  (modules/linux-runner,           │
│  modules/voice-input)                           │
├─────────────────────────────────────────────────┤
│  Android native  (proot argv, forkpty, /proc    │
│  kill, provisioning, overlay, FS)               │
├─────────────────────────────────────────────────┤
│  Debian guest  (rootfs + toolchain + Astra CLI) │
│  /workspace · /workspaces · /bin/astra          │
└─────────────────────────────────────────────────┘
```

## Process model

- **One app process.** All `AsyncFunction` bridges in expo-modules-core
  dispatch on a **single shared queue thread** — a multi-minute
  `executeCommandStream` blocks every other native call behind it.
  Consequence: long agent turns stall unrelated FS/config calls (mitigated
  by sync-native-first FS with timeouts), and **kills run on a dedicated
  `killScope` thread** so they can never queue behind a stream.
- **Guest processes are app-lifetime only.** PRoot keeps tracing forked
  children, so a blocking call that spawns survivors never returns —
  **daemons must spawn from a persistent supervisor PTY session**, never
  from `executeCommand` (this is why the desktop starts via `desktop-svc`).
- **Guest `kill` does not work.** Signals through PRoot return EPERM, so
  all process killing is host-side native via `/proc` scans
  (`ProcessTreeKiller`), restricted to the app UID.

## Storage map

| Path (guest view) | Reality | Lifetime |
|---|---|---|
| `/`, `/root`, `/tmp` | App-private Debian rootfs | Persists across launches, wiped on reinstall |
| `/workspace`, `/workspaces` | Bound to app-private workspaces dir | Same as above |
| `/sdcard`, `/storage` | Phone-shared storage bind | Shared with the phone |
| Android system areas | Unreachable | OS sandbox |

Custom workspace directories (e.g. `/sdcard/Documents/...`) are registered
by absolute path and opened in place.

## Data flow: agent turn

1. Chat UI (`useChatSession`) → `processAgentQuery` (`agentCore.ts`).
2. `astraCliService` builds the prompt (`astraPromptBuilder`: workspace dir,
   running tasks, IDE directives) and runs `/bin/astra … -o stream-json`
   inside the guest via `executeCommandStream`.
3. `AstraStreamParser` consumes NDJSON events: thoughts/tool calls/deltas,
   approval gating, `[IDE_ACTION:…]` handling (open file, open browser,
   register background tasks).
4. File side-effects land in the workspace dir; `workspaceService` notifies
   listeners and the file explorer refreshes.

## Data flow: terminal I/O

- **PTY sessions** (shell tabs): forkpty → xterm.js WebView. JS owns the
  soft keyboard (xterm's textarea is disabled — it drops fast Gboard input);
  bytes go raw to the pty; resize flows fit → `TIOCSWINSZ` + `SIGWINCH`.
- **Pipe sessions** (task tabs): `Process` + reader thread, read-only log
  rendering via `AnsiRenderer`.
- The JS banner is display-only; the real prompt always comes from the
  shell stream. Native history merges are delta-only appends.

## Key invariants

- Sync native calls settle instantly and can never pend — **native-first,
  expo as a raced fallback** (`nativeFs.ts`, `fsRace` 3s).
- The terminal buffer never contains a fake shell prompt.
- Guest `ps`/`pgrep`/`lsof` output can't be trusted for kills or port discovery
  (HTTP probes + pidfiles + `/proc` instead).
- The guest prompt is deliberately plain (`astra:\w# `) for a consistent xterm render.
