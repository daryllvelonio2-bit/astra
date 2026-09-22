<div align="center">

# ⚡ Astra

### The all-in-one mobile coding IDE for Android

*Edit · Run · Git · Preview · Desktop — with an autonomous AI agent built in.*

![Android](https://img.shields.io/badge/Platform-Android-3DDC84?style=for-the-badge&logo=android&logoColor=white)
![Expo](https://img.shields.io/badge/Expo-SDK%2054-000020?style=for-the-badge&logo=expo&logoColor=white)
![React Native](https://img.shields.io/badge/React_Native-0.81-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Debian](https://img.shields.io/badge/Debian-bookworm_embedded-A81D33?style=for-the-badge&logo=debian&logoColor=white)

</div>

---

Your phone is a computer — **Astra** treats it like one. Instead of toy
editors or SSH-ing into a remote server, Astra runs a complete development
environment **on-device**: a real Debian Linux userland embedded in the app,
a VS Code-style editor, a PTY terminal, a Git client, a browser preview, a
full Linux desktop, and a Gemini-powered coding agent that edits, runs, and
ships code alongside you.

## ✨ Features

| | |
|---|---|
| 📝 **Editor** | Themed editing with syntax highlighting, diagnostics, formatting, virtualized large-file viewing, and a resizable file explorer with drag & drop |
| 🤖 **AI Agent** | Autonomous Gemini agent that builds features, fixes bugs, runs servers, and opens results in your editor — via fullscreen chat or a floating chathead |
| 💻 **Terminal** | Real PTY terminal (xterm.js) with Termux-class tooling, extra-keys row, themes, and multi-session tabs |
| 🌿 **Git** | GitHub-Desktop-style client: stage, AI-generated commit messages, branches, history, diffs, push/pull with token or SSH auth, one-tap repo cloning |
| 🌐 **Browser** | Live preview of your dev servers with port detection and navigation |
| 🖥️ **Desktop** | On-demand XFCE Linux desktop (VNC) for GUI tools, with landscape fullscreen |
| 📦 **Workspaces** | Sandboxed projects, custom directories anywhere on storage, dynamic per-platform paths |
| 🎨 **Personal** | Dark / Light / Midnight themes, switchable models, toggleable tabs and shortcuts |

## 🚀 Quick start

```sh
# first time: fetch Debian rootfs assets, bootstrap the toolchain
./setup-linux-assets.sh
./build-local-apk.sh

# daily loop: Metro in an external terminal, then install & launch
./start-debug.sh
```

> A physical Android device with USB debugging + a Gemini API key
> (Settings → Keys) is all you need. Full guide:
> **[docs/getting-started.md](docs/getting-started.md)**

## 📚 Documentation

| Doc | What's inside |
|---|---|
| [Introduction](docs/README.md#introduction) | What Astra is and who it's for |
| [Getting Started](docs/getting-started.md) | Setup, dev loop, build scripts |
| [Architecture](docs/architecture.md) | Layers, process model, storage map, data flows |
| [IDE](docs/ide.md) | Workspaces, editor, terminal, Git, desktop, settings |
| [AI Engine](docs/ai-engine.md) | Agent, Astra CLI bridge, runners, chat, voice |
| [Native Modules](docs/native-modules.md) | PRoot/PTY bridges, provisioning, process model |
| [Configuration](docs/configuration.md) | `config.json`, models, paths, permissions |
| [Conventions](docs/conventions.md) | Repo rules and verification workflow |
| [Troubleshooting](docs/troubleshooting.md) | Failure playbook from real on-device history |

## 🛠️ Built with

React Native (Expo SDK 54) · TypeScript · Debian Linux + PRoot ·
xterm.js · noVNC/XFCE · Gemini · Expo native modules (Kotlin + JNI C)

## 📓 Status

Actively developed — see [`PROGRESS.md`](PROGRESS.md) for the chronological
build log of every feature and fix.

---

<div align="center">

*Carry your dev environment everywhere.* ⚡

</div>
