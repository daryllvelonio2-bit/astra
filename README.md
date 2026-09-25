<div align="center">

# ⚡ Astra

### The all-in-one mobile coding IDE for Android

*Edit · Run · Terminal · Git · Preview — a real Linux dev environment on your phone.*

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
a CodeMirror 6 editor, a PTY terminal, a Git client, and a browser preview
for your dev servers.

## ✨ Features

| | |
|---|---|
| 📝 **Editor** | Themed editing with CodeMirror 6 syntax highlighting, diagnostics, formatting, completions, virtualized large-file viewing, and a resizable file explorer with drag & drop |
| 💻 **Terminal** | Real PTY terminal (xterm.js) with Termux-class tooling, extra-keys row, themes, and multi-session tabs |
| ▶ **Run** | One-tap execution in the on-device Debian guest — direct runners for JS/Python/TS, C/C++/Go/Rust/Java/Ruby/Lua/shell/SQL, plus project detection and an HTML preview server |
| 🌿 **Git** | GitHub-Desktop-style client: stage, AI-generated commit messages, branches, history, diffs, push/pull with browser login, token or SSH auth, one-tap repo cloning |
| 🌐 **Browser** | Live preview of your dev servers with port detection and navigation |
| 📦 **Workspaces** | Sandboxed projects, custom directories anywhere on storage, dynamic per-platform paths |
| 🎨 **Personal** | Dark / Light / Midnight themes, toggleable bottom tabs |

## 🚀 Quick start

```sh
# first time: fetch Debian rootfs assets, bootstrap the toolchain
./setup-linux-assets.sh
./build-local-apk.sh

# daily loop: Metro in an external terminal, then install & launch
./start-debug.sh
```

> A physical Android device with USB debugging is all you need. A Gemini API
> key (Settings → Keys) enables AI-generated commit summaries. Full guide:
> **[docs/getting-started.md](docs/getting-started.md)**

## 📚 Documentation

| Doc | What's inside |
|---|---|
| [Introduction](docs/README.md#introduction) | What Astra is and who it's for |
| [Getting Started](docs/getting-started.md) | Setup, dev loop, build scripts |
| [Architecture](docs/architecture.md) | Layers, process model, storage map, data flows |
| [IDE](docs/ide.md) | Workspaces, editor, terminal, browser, Git, settings |
| [Native Modules](docs/native-modules.md) | PRoot/PTY bridge, provisioning, process model |
| [Configuration](docs/configuration.md) | `config.json`, models, paths, permissions |
| [Conventions](docs/conventions.md) | Repo rules and verification workflow |
| [Troubleshooting](docs/troubleshooting.md) | Failure playbook from real on-device history |

## 🛠️ Built with

React Native (Expo SDK 54) · TypeScript · Debian Linux + PRoot ·
CodeMirror 6 · xterm.js · Gemini · Expo native module (Kotlin + JNI C)

## 📓 Status

Actively developed — see [`PROGRESS.md`](PROGRESS.md) for the chronological
build log of every feature and fix.

---

<div align="center">

*Carry your dev environment everywhere.* ⚡

</div>