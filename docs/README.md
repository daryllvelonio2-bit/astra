# Astra Documentation

## Introduction

**Astra** (formerly `ai-coder`) is an all-in-one mobile coding IDE for
Android. It puts a complete development environment in your pocket: a code
editor, a real Linux terminal, a Git client and a web preview browser — all
running **on-device**.

**The problem it solves:** phones are capable computers, but mobile coding
is usually limited to toy editors or SSH-ing into a remote server. Astra
instead runs a Debian Linux userland embedded directly inside the app via
PRoot. Node.js, Python, Git and compilers execute locally, with no server
and no external terminal app. Your projects live in sandboxed workspaces on
the phone, with the option to open any directory on shared storage
(e.g. `/sdcard/...`).

**What you can do with it:**

- **Write code** in a themed editor (CodeMirror 6) with syntax
  highlighting, diagnostics, formatting, completions, and project-wide
  file management.
- **Run code** in a real PTY-backed terminal with Termux-class tooling, or
  straight from the editor's Run button.
- **Manage Git** with a GitHub-Desktop-style client: stage, commit (with
  AI-generated summaries), branch, push/pull with token or SSH auth, and
  clone any repo straight into a workspace.
- **Preview** your dev servers in the built-in browser, with port detection
  for servers started in the terminal.
- **Tune it** — dark/light/midnight themes, and show/hide control over the
  bottom tabs.

**Who it's for:** developers who want to code, experiment, and ship from
their phone — whether that's building on the go, learning to program
without a laptop, or carrying a backup dev environment everywhere.

**How it's built:** a React Native / Expo (SDK 54) app in two parts —
`src/ide/` (the whole IDE: workspaces, editor, terminal, browser, Git) and
the native Expo module `modules/linux-runner` (PRoot exec, PTY, FS,
provisioning, process killing). Start with
[getting-started](getting-started.md) to run it, or
[architecture](architecture.md) to understand how the pieces fit.

## Contents

| File | Covers |
|---|---|
| [getting-started.md](getting-started.md) | Requirements, first-time setup, daily dev loop, building the APK |
| [architecture.md](architecture.md) | System layers, process model, storage map, data flows |
| [ide.md](ide.md) | Workspaces, picker, editor, terminal, browser, Git tab, settings, themes |
| [native-modules.md](native-modules.md) | `linux-runner` bridge, PTY, toolchain provisioning, process killing |
| [configuration.md](configuration.md) | `config.json` reference, models, storage paths, Android permissions |
| [conventions.md](conventions.md) | Repo rules (`agents.md`), file budgets, verification workflow |
| [troubleshooting.md](troubleshooting.md) | Failure playbook from real on-device history |

## Five-minute orientation

- **Entry:** `index.ts` → `App.tsx` (screens: picker / editor; the editor
  stays mounted once opened so PTY sessions survive navigation).
- **IDE UI + state:** `src/ide/` — workspaces, editor, terminal, browser,
  Git, settings.
- **Services:** `src/ide/services/` — `workspaceService`, `gitService`,
  `configService`, `runService`, `prootService`.
- **Native bridge:** `modules/linux-runner/` — PRoot exec, PTY, FS,
  provisioning, kills.
- **Guest environment:** Debian bookworm-slim rootfs + developer toolchain,
  provisioned into app-private storage on first launch.
- **Rules of the road:** `agents.md` (≤500 lines/file, theme tokens only,
  debug builds, Metro in an external terminal).

## More context

- `PROGRESS.md` — chronological build log; the ground truth for *why*
  things are the way they are.
- `tasks.md` — the performance-optimization plan and its exit gates.