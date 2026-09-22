# Original User Request

## Initial Request — 2026-09-06T13:28:50Z

Build a high-performance, fully native Android IDE application in Kotlin and Jetpack Compose that incorporates all capabilities of the current app at `/home/janelle/Documents/projects/ai-coder` (VS Code Web, Terminal, Web Browser, Git, AI Coding Assistant, Settings & Setup Wizard), optimizing the entire UI shell in native Kotlin while reusing and migrating the proven Alpine Linux PRoot and C/JNI pseudo-terminal (PTY) backend.

Working directory: /home/janelle/Documents/projects/ai-coder-native
Integrity mode: development

## Requirements

### R1. Native Android (Kotlin / Jetpack Compose) Application Shell
Create a new standalone Android project targeting Android SDK 34+ using Jetpack Compose with Material 3, edge-to-edge display, system dark/light themes, and navigation for all IDE areas:
- VS Code Web
- Terminal
- Web Browser Preview
- Git Management
- AI Assistant / Chat Interface
- Settings & First-Run Setup Wizard

### R2. Native PRoot & PTY Service Layer
Migrate and integrate the existing native backend modules from `/home/janelle/Documents/projects/ai-coder/modules/linux-runner` (`PtyNative.kt`, `pty_session.c`, `ProotSessionConfig.kt`, and Alpine rootfs setup) into a persistent Android `ForegroundService` with `WakeLock`, removing all React Native and Expo dependencies.

### R3. Embedded VS Code Web
Embed local `code-server` (running on `http://127.0.0.1:8082`) in an optimized Android `WebView` supporting hardware-accelerated canvas rendering, mobile viewport sizing, physical keyboard input, and virtual keyboard suppression on single-tap with double-tap activation.

### R4. Integrated Native Terminal Interface
Implement a responsive terminal connected directly to the `PtyNative` session, supporting bi-directional text I/O, ANSI/VT escape sequence rendering, touch scrolling, and external physical keyboard input.

### R5. Native Git & Web Browser Tools
- Web Browser preview tab with local and external URL loading, reload, and navigation controls.
- Git management interface for staging, committing, branch switching, and status inspection.

### R6. Native AI Coding Assistant Interface
Integrated AI chat interface supporting multi-model interactions, code snippet copy, and assistant actions.

## Acceptance Criteria

### Build & Compilation
- [ ] The new project contains a standard Gradle structure (`build.gradle.kts` / `settings.gradle.kts`) that builds successfully with `./gradlew assembleDebug`.
- [ ] The native C JNI bridge (`pty_session.c` / `CMakeLists.txt`) compiles and links `libptynative.so` without errors for `arm64-v8a` and `x86_64`.

### Service & Backend
- [ ] The native `ForegroundService` successfully starts and exposes a management interface to initialize PRoot and monitor the `code-server` process.
- [ ] PTY session creation, read/write I/O, and window resizing functions execute without crashes.

### UI & Feature Parity
- [ ] The Jetpack Compose app launches cleanly with full navigation across all tabs (VS Code, Terminal, Browser, Git, AI Chat, Settings).
- [ ] The VS Code tab embeds and loads the local code-server instance in a hardware-accelerated `WebView`.
- [ ] The terminal tab connects to a live shell session with active command input and output.
- [ ] Web Browser, Git, and AI Chat screens are functional and integrated into the native Compose UI.

## Server Restart Resume — 2026-09-06T14:24:15Z

Server restarted — please resume. Last confirmed state before restart:
- Milestone 1 (Gradle build, CMake, C/JNI PTY bridge, ForegroundService) COMPLETE. `app-debug.apk` (17MB) built successfully with `libptynative.so` for arm64-v8a and x86_64.
- Milestone 1 verification swarm (2 Reviewers, 2 Challengers, 1 Forensic Auditor) was active.
- E2E Test Suite (493 tests, Tiers 1-4) was complete at `tests/e2e/`.
- Project directory: `/home/janelle/Documents/projects/ai-coder-native`

Please check the current state of the project at that directory (read PROJECT.md and progress.md if present), then continue from where the team left off — implementing Milestone 2 (PRoot/Alpine service layer) and Milestone 3 (Jetpack Compose UI shell screens). The user expects full feature parity with `/home/janelle/Documents/projects/ai-coder`: VS Code WebView, Terminal, Web Browser, Git, AI Chat, Settings & Setup Wizard.
