# Troubleshooting

## Workspace opens slowly or the gate sticks at "Starting..."

Expo FS calls stall while a long-running guest command holds the single
native queue. The FS layer (`nativeFs.ts`) is native-first with raced
fallbacks, the scan has a 45s timeout, and the loading screen shows live
progress with Back and Retry — wait for the timeout, then Retry.
Persistent stalls usually mean a stuck command: restart the terminal
session or the app.

## Terminal looks frozen after typing

Likely XOFF flow-control freeze (an armed CTRL + `s` with IXON on) — press
the session restart (↻). If the layout looks wedged (1-char-per-line wraps),
the fit ran pre-layout; switching terminal tabs away and back repaints at
the true grid.

## Kill spins but the server still responds

Guest `kill` gets EPERM through PRoot and guest `ps`/`lsof` output is
unreliable — kills are 100% host-side native. If a server predates the
tracking registry (e.g. started before a reinstall), kill it once from the
terminal (`pkill -9 -f "<pattern>"` still works for the shell's own tree),
then re-verify.

## Settings won't load / the screen looks empty

Same single-queue stall class: config reads route through the hardened
`nativeFs` layer. If the screen is empty, wait out the in-flight command or
restart the app; data on disk (`config.json`, `conversations/`) is intact.

## Backspace doesn't erase in the terminal

The guest prompt stays plain for a consistent xterm render. If a tool rewrote the guest `.profile` with colors, restart the
session (the provisioned template restores the plain prompt).

## Git push/pull fails on a private repo

The clone/sync flow routes auth failures to the credentials modal: use a
fine-grained PAT (`GitTokenTab`), sign in with the browser flow
(`GitBrowserLoginTab`), or generate an ed25519 key and add it to GitHub
(`GitSshKeyTab`), then retry. SSH remotes need the `git@github.com:...`
form with `StrictHostKeyChecking accept-new` (auto-provisioned in
`~/.ssh/config`).

## `opencode` says "postinstall script not run" / command not found

Settings → Linux → opencode card → **Repair**. The npm wrapper ships a stub
until its postinstall downloads the platform binary; the repair reruns the
postinstall, reinstalls with scripts forced on, or falls back to the
official curl installer, verifying `opencode --version` after each step.
A common root cause is an orphan file at `/usr/local/bin/opencode`
shadowing a good binary at `~/.opencode/bin` — repairing removes it, and
afterwards run `hash -r` in an open shell so bash drops the cached path.

## The toolchain never finishes provisioning

Check Settings → Linux for the live stage log. Stage installs are
per-package and retried (a missing package flags `PKG_FAIL:<name>` rather
than aborting the stage), so a partly-downloaded list converges on the next
run. If every package is "unable to locate" and the guest has no network,
the problem is the network path, not the app: verify with
`apt-get update` in the terminal. Nothing auto-downloads either — the
**Auto-download toolchain** switch is off by default.