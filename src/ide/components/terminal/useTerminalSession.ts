import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ScrollView } from "react-native";
import { useTerminalHistory, useTerminalClipboard } from "./terminalHistory";
import { useTerminalTabNames } from "./useTerminalTabNames";
import { nextShellIndex } from "./terminalTabName";
import {
  startTerminalSession,
  startPtySession,
  writeTerminalInput,
  stopTerminalSession,
  getSessionHistory,
  addTerminalDataListener,
  initializeEnvironment,
  executeCommand,
} from "../../../../modules/linux-runner/src";
import { PTY_XTERM_ENABLED } from "./ptyConfig";
import { themeToTerminalTheme, TerminalTheme } from "./terminalThemes";
import { useRunSessionEffect } from "./useRunSession";
import { useTheme } from "../../../theme/themeContext";
import {
  getBannerPath,
  appendCapped,
  mergeNativeHistory,
  stripLeakedTerminalText,
  createRunMarkerScanner,
} from "./terminalBuffer";
import { notify } from "../../services/notificationService";
import { RUN_SESSION_ID } from "../../services/runService";
import { loadTerminalFontSize, saveTerminalFontSize } from "../../services/configService";

export interface TerminalTab {
  id: string;
  name: string;
  isTask?: boolean;
  taskId?: string;
}

interface UseTerminalSessionProps {
  workspaceId?: string;
  /**
   * Native shell id this hook owns. Defaults to "session-1" (what the Terminal
   * tab has always used). The Host tab's embedded terminal passes its own id so
   * it never aliases the Terminal tab's PTY — distinct ids are already the
   * app's design (`run-session` does the same) and keep each mount's teardown
   * scoped to its own shell.
   */
  initialSessionId?: string;
}

const getBanner = (workspaceId?: string) => getBannerPath(workspaceId);

// Lipgloss/bubbletea TUIs (opencode) pick dark vs light variants via
// COLORFGBG. Native defaults to dark ("15;default;0"); JS live-exports the
// light value when the global theme is light so black-on-black never happens.
const colorFgBgForTheme = (isDark: boolean) => (isDark ? "15;default;0" : "0;default;15");

// Shell spawn honoring the Phase 2 flag (PTY vs legacy pipe shell).
async function startShellSession(sessionId: string, workspaceId?: string) {
  if (PTY_XTERM_ENABLED) {
    await startPtySession(sessionId, workspaceId);
  } else {
    await startTerminalSession(sessionId, workspaceId);
  }
}

export function useTerminalSession({
  workspaceId,
  initialSessionId = "session-1",
}: UseTerminalSessionProps) {
  const { theme: appTheme } = useTheme();
  const [sessions, setSessions] = useState<TerminalTab[]>([
    { id: initialSessionId, name: "1: sh" },
  ]);
  const [activeSessionId, setActiveSessionId] = useState<string>(initialSessionId);
  const [sessionOutputs, setSessionOutputs] = useState<Record<string, string>>({
    [initialSessionId]: getBanner(workspaceId),
  });
  const [isCtrlActive, setIsCtrlActive] = useState<boolean>(false);
  const [isAltActive, setIsAltActive] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [fontSize, setFontSize] = useState<number>(14);

  useEffect(() => {
    loadTerminalFontSize().then((saved) => {
      if (typeof saved === "number" && saved >= 10 && saved <= 24) {
        setFontSize(saved);
      }
    }).catch(() => {});
  }, []);

  const { recordCommand, navigateHistory } = useTerminalHistory();
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  // Dynamic tab names (`N: <program>`); the hook owns the per-session
  // half-typed line buffers, this file just feeds it bytes + commands.
  const { trackTypedInput, renameForCommand, renameShellTab, dropTracked } =
    useTerminalTabNames(setSessions);

  const scrollRef = useRef<ScrollView>(null);
  const isAutoScrollEnabled = useRef<boolean>(true);
  // Bytes of native history already folded into each session buffer.
  const seenNativeLen = useRef<Record<string, number>>({});
  // Shell (non-task) session ids alive in this mount. Native start is a
  // no-op for a running id, so these must be stopped when the workspace
  // changes — otherwise terminals keep the old workspace cwd and binds.
  const shellIdsRef = useRef<string[]>([initialSessionId]);
  // Last COLORFGBG pushed per shell session; avoids re-export spam.
  const exportedFgBgRef = useRef<Record<string, string>>({});
  // Legacy pipe mode: strip run markers and raise notifications there too.
  const markerScanner = useRef(
    createRunMarkerScanner((m) => {
      notify({
        source: "terminal",
        tone: m.code === 0 ? "success" : "error",
        title: m.code === 0 ? `Run finished: ${m.label}` : `Run exited (${m.code}): ${m.label}`,
        message: `exit ${m.code} · ${m.duration}`,
      });
    })
  ).current;

  const syncThemeEnv = useCallback((isDark: boolean) => {
    const want = colorFgBgForTheme(isDark);
    if (exportedFgBgRef.current["__global"] === want) return;
    exportedFgBgRef.current["__global"] = want;
    executeCommand(
      `printf 'export COLORFGBG="%s"\\nexport COLORTERM=truecolor\\nexport TERM_PROGRAM=AstraIDE\\n' "${want}" > /root/.theme_env 2>/dev/null`
    ).catch(() => {});
  }, []);

  const foldNativeHistory = useCallback((sessionId: string, hist: string) => {
    const cleanHist = sessionId === RUN_SESSION_ID
      ? markerScanner.feed(stripLeakedTerminalText(hist))
      : stripLeakedTerminalText(hist);
    if (!cleanHist) return;
    setSessionOutputs((prev) => {
      const current = prev[sessionId] || "";
      const merged = mergeNativeHistory(current, cleanHist, seenNativeLen.current[sessionId] || 0);
      seenNativeLen.current[sessionId] = merged.seen;
      if (merged.text === current) return prev;
      return { ...prev, [sessionId]: merged.text };
    });
  }, []);

  const activeTheme: TerminalTheme = useMemo(
    () => themeToTerminalTheme(appTheme),
    [appTheme]
  );

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2000);
  }, []);

  // Initialize Linux environment and start initial session.
  // TerminalView is keyed by workspaceId (see IDELayout), so a workspace
  // switch remounts us: stop the old shell sessions here so the fresh mount
  // respawns them inside the new workspace instead of reusing the stale cwd.
  useEffect(() => {
    let mounted = true;
    const init = async () => {
      await initializeEnvironment();
      if (!mounted) return;
      setIsReady(true);
      await startShellSession(initialSessionId, workspaceId);
      syncThemeEnv(appTheme.isDark);
      const hist = await getSessionHistory(initialSessionId);
      if (hist && mounted) {
        foldNativeHistory(initialSessionId, hist);
      }
    };
    init();
    return () => {
      mounted = false;
      shellIdsRef.current.forEach((id) => {
        try {
          stopTerminalSession(id);
        } catch (_) {}
      });
      shellIdsRef.current = [initialSessionId];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, initialSessionId]);

  // Live global theme → shell hint: when user flips Light/Dark, sync to /root/.theme_env
  // silently so current and future shell sessions pick it up without leaking text.
  useEffect(() => {
    if (!isReady) return;
    syncThemeEnv(appTheme.isDark);
  }, [appTheme.isDark, isReady, syncThemeEnv]);

  // Subscribe to native terminal streaming events for the active session.
  // Skipped for shell tabs in PTY mode: XtermView owns that stream (this
  // per-chunk setState + autoscroll would re-render every flood chunk).
  useEffect(() => {
    let isSubscribed = true;

    if (PTY_XTERM_ENABLED && !activeSessionId.startsWith("task-")) return;

    // Load buffered history when switching sessions (for native sh sessions)
    if (!activeSessionId.startsWith("task-")) {
      getSessionHistory(activeSessionId).then((hist) => {
        if (hist && isSubscribed) {
          foldNativeHistory(activeSessionId, hist);
        }
      });

      const subscription = addTerminalDataListener(activeSessionId, (chunk: string) => {
        if (!isSubscribed) return;
        const cleanChunk = markerScanner.feed(stripLeakedTerminalText(chunk));
        if (!cleanChunk) return;
        // Live stream bytes are new by definition: count them as seen so a
        // later history snapshot doesn't re-append them.
        seenNativeLen.current[activeSessionId] =
          (seenNativeLen.current[activeSessionId] || 0) + cleanChunk.length;
        setSessionOutputs((prev) => {
          const current = prev[activeSessionId] || "";
          const updated = appendCapped(current, cleanChunk);
          if (updated === current) return prev;
          return { ...prev, [activeSessionId]: updated };
        });

        if (isAutoScrollEnabled.current) {
          setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 20);
        }
      });

      return () => {
        isSubscribed = false;
        markerScanner.flush();
        subscription.remove();
      };
    }
  }, [activeSessionId]);

  // Editor Run button executes in the dedicated Run session (created once, reused).
  useRunSessionEffect({
    workspaceId,
    setSessions,
    setSessionOutputs,
    setActiveSessionId,
    scrollRef,
    shellIdsRef,
    bannerFor: getBanner,
  });

  const sendInput = useCallback(
    (inputData: string, targetId?: string) => {
      let finalData = inputData;

      if (isCtrlActive && inputData.length === 1) {
        const code = inputData.toUpperCase().charCodeAt(0);
        if (code >= 64 && code <= 95) {
          finalData = String.fromCharCode(code - 64);
        }
        setIsCtrlActive(false);
      } else if (isAltActive && inputData.length === 1) {
        finalData = `\x1b${inputData}`;
        setIsAltActive(false);
      }

      writeTerminalInput(targetId || activeSessionId, finalData);
      // Dynamic tab name: fold typed bytes so Enter renames `N: sh`.
      trackTypedInput(targetId || activeSessionId, finalData);
    },
    [activeSessionId, isCtrlActive, isAltActive, trackTypedInput]
  );

  const runCommandDirectly = useCallback(
    (cmd: string, targetId?: string) => {
      const trimmed = cmd.trim();
      if (!trimmed) return;

      const sid = targetId || activeSessionId;
      recordCommand(trimmed);
      // Legacy pipe mode knows the full command: rename the tab from it.
      renameForCommand(sid, trimmed);

      // Append command with newline to session display buffer so it stays visible
      setSessionOutputs((prev) => {
        const current = prev[sid] || "";
        return {
          ...prev,
          [sid]: `${current}${trimmed}\r\n`,
        };
      });

      // Route directly to native active session
      writeTerminalInput(sid, `${trimmed}\n`);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 30);
    },
    [activeSessionId, recordCommand, renameForCommand]
  );

  const { copyActiveOutput, copyXtermSelection, pasteFromClipboard } = useTerminalClipboard(
    activeSessionId,
    sessionOutputs,
    showToast
  );

  const zoomIn = useCallback(() => {
    setFontSize((prev) => {
      const next = Math.min(24, prev + 1);
      saveTerminalFontSize(next).catch(() => {});
      return next;
    });
  }, []);

  const zoomOut = useCallback(() => {
    setFontSize((prev) => {
      const next = Math.max(10, prev - 1);
      saveTerminalFontSize(next).catch(() => {});
      return next;
    });
  }, []);

  const addNewSession = useCallback(async () => {
    // Max existing shell number + 1: close-safe (length+1 collided).
    const nextIdx = nextShellIndex(sessions.map((s) => s.name));
    const newId = `session-${Date.now()}`;
    const newTab: TerminalTab = {
      id: newId,
      name: `${nextIdx}: sh`,
    };
    shellIdsRef.current.push(newId);

    setSessions((prev) => [...prev, newTab]);
    setSessionOutputs((prev) => ({ ...prev, [newId]: getBanner(workspaceId) }));
    seenNativeLen.current[newId] = 0;
    setActiveSessionId(newId);

    await startShellSession(newId, workspaceId);
    syncThemeEnv(appTheme.isDark);
  }, [sessions, workspaceId, appTheme.isDark, syncThemeEnv]);

  const closeSession = useCallback(
    async (idToClose: string) => {
      if (sessions.length <= 1) return;

      await stopTerminalSession(idToClose);
      shellIdsRef.current = shellIdsRef.current.filter((id) => id !== idToClose);

      const remaining = sessions.filter((s) => s.id !== idToClose);
      setSessions(remaining);
      dropTracked(idToClose);
      setSessionOutputs((prev) => {
        const copy = { ...prev };
        delete copy[idToClose];
        return copy;
      });
      delete exportedFgBgRef.current[idToClose];

      if (activeSessionId === idToClose) {
        setActiveSessionId(remaining[0]?.id || initialSessionId);
      }
    },
    [sessions, activeSessionId, dropTracked]
  );

  const restartActiveSession = useCallback(async () => {
    await stopTerminalSession(activeSessionId);
    setSessionOutputs((prev) => ({ ...prev, [activeSessionId]: getBanner(workspaceId) }));
    seenNativeLen.current[activeSessionId] = 0;
    delete exportedFgBgRef.current[activeSessionId];
    dropTracked(activeSessionId);
    // Fresh shell: reset a stale program name back to `N: sh`.
    renameShellTab(activeSessionId, "sh");
    await startShellSession(activeSessionId, workspaceId);
    syncThemeEnv(appTheme.isDark);
    showToast("Session restarted");
  }, [activeSessionId, workspaceId, appTheme.isDark, syncThemeEnv, showToast, dropTracked, renameShellTab]);

  const clearActiveSession = useCallback(() => {
    // Clear scrollback to a title-only banner and ask the shell for a fresh,
    // truthful prompt (never a frozen fake one, so `cd` always displays).
    writeTerminalInput(activeSessionId, "\n");
    setSessionOutputs((prev) => ({
      ...prev,
      [activeSessionId]: getBanner(workspaceId),
    }));
  }, [activeSessionId, workspaceId]);

  return {
    sessions,
    activeSessionId,
    setActiveSessionId,
    activeOutput: sessionOutputs[activeSessionId] || "",
    isCtrlActive,
    isAltActive,
    setIsCtrlActive,
    setIsAltActive,
    isReady,
    fontSize,
    theme: activeTheme,
    toastMessage,
    scrollRef,
    sendInput,
    runCommandDirectly,
    navigateHistory,
    copyActiveOutput,
    copyXtermSelection,
    pasteFromClipboard,
    zoomIn,
    zoomOut,
    addNewSession,
    closeSession,
    restartActiveSession,
    clearActiveSession,
  };
}
