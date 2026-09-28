ISSUE: Astra terminal — scrolling becomes very sluggish after split->single-pane, but ONLY while a mouse-reporting TUI (opencode / other CLI) is running

CONTEXT
- Repo: /home/janelle/Documents/projects/astra (Expo React Native mobile IDE; obey agents.md: <=500 lines/file, theme tokens, PROGRESS.md update, auto-commit, debug builds, phase-by-phase).
- Terminal render: src/ide/components/terminal/XtermView.tsx = react-native-webview hosting xterm.js. The page is built from scripts/build-xterm-html.js into src/ide/components/terminal/xtermHtml.generated.ts. Regenerate: node scripts/build-xterm-html.js. Glue changes are JS-only -> Metro reload, no APK rebuild.
- PTY: expo module modules/linux-runner (TerminalSession); RN writes stdin via writeTerminalInput(sessionId, data), replay via getSessionHistory.
- Panes: src/ide/components/TerminalView.tsx (single vs split JSX trees), split state in terminal/useSplitTerminal.ts, toggle button in terminal/TerminalHeader.tsx.
- Device: Huawei JNY-LX1 over WiFi adb (last known 192.168.43.1:5555 — RE-VERIFY, IPs change). Metro: ./metro.sh in a visible kitty window (:8081, adb reverse). App id: com.janelle.aicoder.

SYMPTOM (user-verified on-device, 2026-09-28)
- Plain shell: single-pane scroll is fine, and it stays fine after split->unsplit (measured via CDP — NOT a bug).
- With opencode (or any alt-screen/mouse-reporting CLI) open: enter split mode, then exit back to single pane -> drag-scrolling moves the view only a few lines per gesture; feels near-stuck. Scrolling inside split itself and in single-pane BEFORE splitting is normal.
- Trigger requires BOTH: a mouse-mode TUI running AND the split->unsplit transition.

REPRO
1. Terminal tab (single pane). Double-tap terminal (new keyboard gate) to raise keyboard, run: opencode   (any bubbletea/htop-style app that enables SGR mouse). Dismiss keyboard.
2. Drag-scroll history — smooth.
3. Tap header grid icon -> split ON. Tap again -> split OFF (back to single pane).
4. Drag-scroll — each swipe scrolls only a little / very sluggish.

KEY MECHANICS (from scripts/build-xterm-html.js glue)
- When appMouseMode() != 'none' (TUI owns the wheel), each touchmove line delta becomes SGR wheel sequences \x1b[<64;col;rowM (64=up, 65=down), COALESCED per requestAnimationFrame into ONE postMessage -> RN -> writeTerminalInput -> PTY -> app redraw round-trip. Alt screen => scrollback range 0 => every scroll tick must round-trip.
- On unsplit the primary XtermView REMOUNTS (different JSX tree position: viewport vs splitWrapper>paneContainer), so a brand-new WebView/page + new Terminal instance, session replay, and fresh reportSize/fit cycle.
- CDP probes in the broken state: geometry recovers fine (win 424x747, rows re-fit, mouse=on, vpSH==vpCH). The scroll path, not layout, is the problem.
- Glue has scrollCursorIntoView() = term.scrollToBottom() + clamp scroll, called from term.onData AND every __astraWrite callback, but ONLY when kbVisible===true (set via window.__astraSetKeyboardVisible(visible, rows), fed from RN prop isKeyboardVisible). RN side: terminal/useTerminalKeyboardPad.ts freezes state through a stateRef when the tab is invisible; TerminalView has wasKeyboardVisibleRef refocus logic; in split mode the prop is focusedPane==='<pane>' && isKeyboardVisible.

HYPOTHESES (verify in this order — do not fix blind)
1. scrollToBottom tug-of-war (most likely): after the unsplit remount, kbVisible is stale TRUE (keyboard state carried through the split transition, or replayed via __astraSetKeyboardVisible at wrong time). A chatty TUI emits continuous output; every write yanks the viewport to the bottom, so a wheel-up of N lines nets 1-2 lines. Matches exactly why it only happens inside opencode/CLI (plain shell is silent while scrolling) and only after the remount. CHECK: in broken state evaluate kbVisible via CDP; instrument how often scrollCursorIntoView fires during one drag.
2. Wheel coordinates stale after remount: cellAt() hardcodes #terminal padding (6px top/8px left) and reads cached dimensions; wrong col/row can make the TUI route wheels to an inactive pane region and ignore them. CHECK: log the actual col;row values posted per tick, working vs broken.
3. rAF coalescing stall: pendingWheel/wheelRaf batching can bunch up right after page (re)creation; some TUIs collapse rapid identical wheel events into one redraw. CHECK: WHEEL posts/sec during a drag, working vs broken.
4. Duplicate PTY listeners after remount: if the old pane's addTerminalDataListener isn't removed cleanly, writes double up -> more redraw churn -> heavier round-trips. CHECK: resize/data event counts.

DIAG TOOLING ALREADY IN PLACE
- /tmp/astra_scroll/monitor2.js — polls all WebView targets via CDP (find socket: adb shell cat /proc/net/unix | grep webview_devtools_remote, then adb forward tcp:9223 localabstract:<socket>) and logs every ~450ms: scrollTop/sh/ch, window, rows, mouse on/off, visible-line first/last, plus a trace ring of postMessage traffic (RESIZE/WHEEL/DATA) and window.__astra* hook calls. Run ~300000-600000 ms in background, reproduce, diff the clean vs broken sections of /tmp/astra_scroll/ticks.log.
- /home/janelle/Documents/projects/astra/cdp_eval.tmp.js — one-shot eval: node cdp_eval.tmp.js "<expr>" 0  (temp dev file, delete when done).
- WebView devtools only exist while the Terminal tab is mounted. App restart drops the socket; re-forward after every restart.

ACCEPTANCE
- Root cause identified with measured evidence (log lines quoted), then fixed.
- On-device verify: inside opencode, scroll feels the same after split->unsplit as before splitting; plain-shell scrolling unaffected; double-tap keyboard gate (raiseKeyboardOnDoubleTap in build-xterm-html.js — do not regress it) still works; split panes still usable; no >500-line files; PROGRESS.md entry + commit.