# Troubleshooting

## Workspace opens slowly or the gate sticks at "Starting…"

Expo FS calls stall while a long agent stream holds the single native queue.
The FS layer (`nativeFs.ts`) is native-first with raced fallbacks, the scan
has a 45s timeout, and the loading screen shows live progress with Back and
Retry — wait for the timeout, then Retry. Persistent stalls usually mean a
stuck stream: restart the session or the app.

## Terminal looks frozen after typing

Likely XOFF flow-control freeze (an armed CTRL + `s` with IXON on) — press
the session restart (↻). If the layout looks wedged (1-char-per-line wraps),
the fit ran pre-layout; switching terminal tabs away and back repaints at
the true grid.

## Desktop stuck at "starting"

The start script's own command line used to match its cleanup `pkill`
patterns (self-kill) — startup now uses pidfiles with `/proc` verification
plus a 60s reconcile fallback. Open the Diagnose view: it lists binaries,
daemon pidfiles with cmdlines, and log tails (`Xvnc`, `websockify`, `xfce`).

## Desktop shows "running" but the viewer refuses connection

The old `pgrep` check matched the starter script itself (false positive).
Readiness is now pidfile + real port-probe based; if it recurs, stop the
desktop (kills the supervisor tree + pidfile sweep) and start again.

## Kill spins but the server still responds

Guest `kill` gets EPERM through PRoot and guest `ps`/`lsof` output is
unreliable — kills are 100% host-side native. If a server predates the
tracking registry (e.g. started before a reinstall), kill it once from the
terminal (`pkill -9 -f "<pattern>"` still works for the shell's own tree)
or stop the desktop supervisor, then re-verify.

## Chat shows empty while tasks run / settings won't load

Same single-queue stall class: conversation listing and config now route
through the hardened `nativeFs` layer. If the screen is empty, wait out the
in-flight turn or restart it; data on disk (`conversations/<ws>.json`,
`config.json`) is intact.

## Backspace doesn't erase in the terminal

The guest prompt stays plain for a consistent xterm render. If a tool rewrote the guest `.profile` with colors, restart the
session (the provisioned template restores the plain prompt).

## Voice mic does nothing / transcription fails

Devices without an Android speech-recognition service fall back to recording
+ Gemini transcription, which needs a configured API key and mic permission
(granted on first tap). Check Settings → Keys first.

## Git push/pull fails on a private repo

The clone/sync flow routes auth failures to the credentials modal: use a
fine-grained PAT (`GitTokenTab`) or generate an ed25519 key and add it to
GitHub (`GitSshKeyTab`), then retry. SSH remotes need the `git@github.com:…`
form with `StrictHostKeyChecking accept-new` (auto-provisioned in
`~/.ssh/config`).
