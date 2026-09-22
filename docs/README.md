# Astra Documentation

## Introduction

**Astra** (formerly `ai-coder`) is an all-in-one mobile coding IDE for
Android. It puts a complete development environment in your pocket: a
VS Code-style code editor, a real Linux terminal, a Git client, a web
preview browser, and an on-demand Linux desktop — with an autonomous
AI coding agent built into every layer.

**The problem it solves:** phones are capable computers, but mobile coding
is usually limited to toy editors or SSH-ing into a remote server. Astra
instead runs everything **on-device**. A Debian Linux userland is embedded
directly inside the app via PRoot — Node.js, Python, PHP, Git, compilers,
and the Astra agent CLI all execute locally, no server or external terminal
app required. Your projects live in sandboxed workspaces on the phone, with
the option to open any directory on shared storage (e.g. `/sdcard/...`).

**What you can do with it:**

- **Write code** in a themed editor with syntax highlighting, diagnostics,
  formatting, and project-wide file management.
- **Run code** in a real terminal (PTY-backed, Termux-class tooling) or
  through the built-in multi-language execution gateway.
- **Vibe-code with AI** — ask the Gemini-powered agent to build features,
  fix bugs, and run servers; it edits files, opens them in the editor, and
  streams progress live in fullscreen chat or a floating chathead.
- **Manage Git** with a GitHub-Desktop-style client: stage, commit (with
  AI-generated summaries), branch, push/pull with token or SSH auth, and
  clone any repo straight into a workspace.
- **Preview and desktop** — live browser preview of your dev servers, plus
  a full XFCE Linux desktop (VNC) for GUI tools.
- **Tune it** — light/dark/midnight themes, switchable models, and
  show/hide control over bottom tabs and the AI shortcut.

**Who it's for:** developers who want to code, experiment, and ship from
their phone — whether that's building on the go, learning to program
without a laptop, or carrying a backup dev environment everywhere.

**How it's built:** a React Native / Expo (SDK 54) app in three parts —
`src/ide/` (workspace UI), `src/ai/` (agent + chat), and native Expo
modules (`linux-runner` for PRoot/PTY/FS/provisioning, `voice-input` for
speech). Start with [getting-started](getting-started.md) to run it, or
[architecture](architecture.md) to understand how the pieces fit.

## Contents

| File | Covers |
|---|---|
| [getting-started.md](getting-started.md) | Requirements, first-time setup, daily dev loop, building the APK |
| [architecture.md](architecture.md) | System layers, process model, data flow, key invariants |
| [ide.md](ide.md) | Workspaces, picker, editor, terminal, browser, Git tab, desktop, settings, themes |
| [ai-engine.md](ai-engine.md) | Agent core, Astra CLI bridge, 3-tier runner, chat UI, voice, background tasks |
| [native-modules.md](native-modules.md) | `linux-runner` / `voice-input` bridges, PTY, toolchain provisioning, process killing |
| [configuration.md](configuration.md) | `config.json` reference, models, storage paths, Android permissions |
| [conventions.md](conventions.md) | Repo rules (`agent.md`), file budgets, verification workflow |
| [troubleshooting.md](troubleshooting.md) | Common failures and proven fixes |

## Five-minute orientation

- **Entry:** `index.ts` → `App.tsx` (screens: picker / chat / editor, chat+editor kept alive once opened).
- **IDE UI + local state:** `src/ide/` — workspaces, editor, terminal, browser, Git, desktop, settings.
- **Agent + LLM:** `src/ai/` — thin agent facade over the Astra CLI (`astra-cli/` bundle) executed inside the Debian guest.
- **Native bridge:** `modules/linux-runner/` (PRoot exec, PTY, FS, provisioning, kills) and `modules/voice-input/` (speech).
- **Guest environment:** Debian bookworm-slim rootfs + developer toolchain + Astra CLI, provisioned into app-private storage on first launch.
- **Rules of the road:** `agent.md` (≤500 lines/file, theme tokens only, debug builds, Metro in an external terminal).

## External docs worth reading first

- `PROJECT_INFO.md` — one-page concept, stack, and 3-tier runner summary.
- `PROGRESS.md` — chronological build log; the ground truth for *why* things are the way they are.
- `astra-cli/ASTRA_AI_GUIDE.md` — guide for the bundled agent CLI.
