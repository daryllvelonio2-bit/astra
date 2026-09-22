# AI Agent Guidelines (`agent.md`)

**MANDATORY:** Read this file first before making any changes or generating code in this repository.

## Core Rules & Philosophy

1. **Zero Bloatware:** Avoid unnecessary UI boxes, overly complex components, verbose explanations, or fluff text. Keep interfaces clean, minimal, and direct.
2. **Simplicity First:** Prioritize straightforward implementations and intuitive workflows over over-engineered solutions.
3. **Scalable Architecture:** Design systems with clean separation of concerns, robust folder structures, and easy extensibility.
4. **Modular Code:** Break down features into small, reusable modules, services, and components.
5. **File Size Limit:** **No code file may exceed 500 lines.** If a file approaches or exceeds 500 lines, refactor and split it into smaller modules.
6. **Strict 1 Feature = 1 File Modularity:** Different feature scopes must reside in separate files to guarantee fault isolation.
7. **Strict User Instruction Adherence & Zero Hallucination:** Follow the user's explicit step-by-step instructions precisely. Never invent unrequested functionality or jump ahead without user guidance.
8. **Progress Tracking:** After every significant update, refactor, or feature addition, update `PROGRESS.md` with a summary of changes, current status, and date.
9. **Debug Mode Release & Deployment:** Always build, release, and deploy the application in **Debug mode** (`assembleDebug` / `build-debug-apk.sh` / `app-debug.apk`) to enable live developer inspection, fast incremental compilation, and active ADB reverse connection.
10. **Launch Debug Mode in Dedicated Terminal:** Always launch the Metro bundler development server in a separate, external terminal window (e.g. `foot`, `kitty`, or `xterm` via `start-debug.sh` / `metro.sh`) so live hot-reloading, bundling logs, and developer sessions run persistently in an independent window.
11. **Strict Global Theme Adherence:** All UI components, editors, terminals, and modals must strictly consume the global theme (`useTheme()`) and dynamic theme tokens. Never use hardcoded static colors that violate the user's active theme selection.
12. **Phase-by-Phase Execution, Never Rush:** Execute multi-phase work strictly one phase at a time. Think thoroughly before every phase, complete it fully, verify its exit gate (typecheck, line limits, behavior), report back, and wait for the user's go before starting the next phase. Never jump ahead, batch phases, or skip verification.
13. **Stability & Speed First:** All code implemented or refactored must strictly prioritize application stability and peak execution speed:
    - **Rock-Solid Stability:** Guarantee zero unhandled promise rejections, comprehensive error boundaries, leak-free subscriptions/intervals/timers with mandatory cleanup on unmount, strict adherence to React Rules of Hooks (never call hooks conditionally or after early returns), and safe serialization of concurrent storage operations.
    - **Maximized Speed & Smoothness:** Prevent main-thread blockage; eliminate re-render cascades using `React.memo`, `useCallback`, and `useMemo`; avoid heavy synchronous computations or unconstrained regex scans on keystroke/render paths; virtualize large lists; and ensure I/O and process execution run asynchronously off the critical UI thread.


