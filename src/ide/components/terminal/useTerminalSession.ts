import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ScrollView } from "react-native";
import { useTerminalHistory, useTerminalClipboard } from "./terminalHistory";
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
import { runningTasksService, RunningTask } from "../../../ai/services/runningTasksService";
import { useRunSessionEffect } from "./useRunSession";
import { useTheme } from "../../../theme/themeContext";
import {
  getBannerTitle,
  appendCapped,
  mergeNativeHistory,
  stripLeakedTerminalText,
} from "./terminalBuffer";
import { loadTerminalFontSize, saveTerminalFontSize } from "../../services/configService";

export interface TerminalTab {
  id: string;
  name: string;
  isTask?: boolean;
  taskId?: string;
}

interface UseTerminalSessionProps {
  workspaceId?: string;
}

const getBanner = (workspaceId?: string, isDark: boolean = true) => getBannerTitle(workspaceId, isDark);

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

const formatTaskTabName = (cmd: string) => {
  const clean = (cmd || "Task")
    .replace(/^(?:nohup|sudo|bash\s+-c)\s*/i, "")
    .replace(/\s+>[^&]+.*$/, "")
    .trim();
  const shortCmd = clean.length > 16 ? `${clean.slice(0, 14)}..` : clean;
  return `⚙️ ${shortCmd}`;
};

export function useTerminalSession({ workspaceId }: UseTerminalSessionProps) {
  const { theme: appTheme } = useTheme();
  const isDarkInitial = appTheme.isDark;
  const [sessions, setSessions] = useState<TerminalTab[]>([
    { id: "session-1", name: "1: sh" },
  ]);
  const [activeSessionId, setActiveSessionId] = useState<string>("session-1");
  const [sessionOutputs, setSessionOutputs] = useState<Record<string, string>>({
    "session-1": getBanner(workspaceId, isDarkInitial),
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

  const scrollRef = useRef<ScrollView>(null);
  const isAutoScrollEnabled = useRef<boolean>(true);
  // Bytes of native history already folded into each session buffer.
  const seenNativeLen = useRef<Record<string, number>>({});
  // Shell (non-task) session ids alive in this mount. Native start is a
  // no-op for a running id, so these must be stopped when the workspace
  // changes — otherwise terminals keep the old workspace cwd and binds.
  const shellIdsRef = useRef<string[]>(["session-1"]);
  // Last COLORFGBG pushed per shell session; avoids re-export spam.
  const exportedFgBgRef = useRef<Record<string, string>>({});

  const syncThemeEnv = useCallback((isDark: boolean) => {
    const want = colorFgBgForTheme(isDark);
    if (exportedFgBgRef.current["__global"] === want) return;
    exportedFgBgRef.current["__global"] = want;
    executeCommand(
      `printf 'export COLORFGBG="%s"\\nexport COLORTERM=truecolor\\nexport TERM_PROGRAM=AstraIDE\\n' "${want}" > /root/.theme_env 2>/dev/null`
    ).catch(() => {});
  }, []);

  const foldNativeHistory = useCallback((sessionId: string, hist: string) => {
    const cleanHist = stripLeakedTerminalText(hist);
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
      await startShellSession("session-1", workspaceId);
      syncThemeEnv(appTheme.isDark);
      const hist = await getSessionHistory("session-1");
      if (hist && mounted) {
        foldNativeHistory("session-1", hist);
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
      shellIdsRef.current = ["session-1"];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

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
        const cleanChunk = stripLeakedTerminalText(chunk);
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
        subscription.remove();
      };
    }
  }, [activeSessionId]);

  // Synchronize running background tasks with terminal tabs
  useEffect(() => {
    const unsubTasks = runningTasksService.subscribe((tasks) => {
      if (tasks.length === 0) return;

      setSessions((prevSessions) => {
        const existingIds = new Set(prevSessions.map((s) => s.id));
        const newTabs: TerminalTab[] = [];

        tasks.forEach((task) => {
          // task.id already has the "task-" prefix (e.g. "task-port-8080")
          const tabId = task.id;
          if (!existingIds.has(tabId)) {
            newTabs.push({
              id: tabId,
              name: formatTaskTabName(task.command),
              isTask: true,
              taskId: task.id,
            });
          }
        });

        if (newTabs.length === 0) return prevSessions;
        return [...prevSessions, ...newTabs];
      });

      // Update session outputs for all running tasks
      setSessionOutputs((prevOutputs) => {
        let changed = false;
        const updated = { ...prevOutputs };

        tasks.forEach((task) => {
          const tabId = task.id;
          const currentOut = updated[tabId];
          const taskOut = task.output || "";
          if (currentOut !== taskOut && taskOut) {
            updated[tabId] = taskOut;
            changed = true;
          }
        });

        return changed ? updated : prevOutputs;
      });
    });

    // Auto-focus the newly triggered task tab
    const unsubTrigger = runningTasksService.subscribeTrigger((taskId) => {
      // taskId already has the "task-" prefix from runningTasksService
      if (taskId) {
        setActiveSessionId(taskId);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
      }
    });

    return () => {
      unsubTasks();
      unsubTrigger();
    };
  }, []);

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
    },
    [activeSessionId, isCtrlActive, isAltActive]
  );

  const runCommandDirectly = useCallback(
    (cmd: string, targetId?: string) => {
      const trimmed = cmd.trim();
      if (!trimmed) return;

      const sid = targetId || activeSessionId;
      recordCommand(trimmed);

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
    [activeSessionId, recordCommand]
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
    const nextIdx = sessions.length + 1;
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

      if (idToClose.startsWith("task-")) {
        const taskId = idToClose;
        const stopped = await runningTasksService.killTask(taskId);
        if (!stopped) {
          runningTasksService.forceRemoveTask(taskId);
        }
        showToast("Background task stopped");
      } else {
        await stopTerminalSession(idToClose);
        shellIdsRef.current = shellIdsRef.current.filter((id) => id !== idToClose);
      }

      const remaining = sessions.filter((s) => s.id !== idToClose);
      setSessions(remaining);
      setSessionOutputs((prev) => {
        const copy = { ...prev };
        delete copy[idToClose];
        return copy;
      });
      delete exportedFgBgRef.current[idToClose];

      if (activeSessionId === idToClose) {
        setActiveSessionId(remaining[0]?.id || "session-1");
      }
    },
    [sessions, activeSessionId, showToast]
  );

  const restartActiveSession = useCallback(async () => {
    if (activeSessionId.startsWith("task-")) {
      const taskId = activeSessionId;
      const task = runningTasksService.findTask(taskId);
      if (task) {
        await runningTasksService.killTask(taskId, true);
        runningTasksService.addTask({
          command: task.command,
          port: task.port,
          url: task.url,
          workspaceId: task.workspaceId,
        });
        showToast("Task restarted");
      }
      return;
    }

    await stopTerminalSession(activeSessionId);
    setSessionOutputs((prev) => ({ ...prev, [activeSessionId]: getBanner(workspaceId) }));
    seenNativeLen.current[activeSessionId] = 0;
    delete exportedFgBgRef.current[activeSessionId];
    await startShellSession(activeSessionId, workspaceId);
    syncThemeEnv(appTheme.isDark);
    showToast("Session restarted");
  }, [activeSessionId, workspaceId, appTheme.isDark, syncThemeEnv, showToast]);

  const clearActiveSession = useCallback(() => {
    if (activeSessionId.startsWith("task-")) {
      const taskId = activeSessionId;
      const task = runningTasksService.findTask(taskId);
      const banner = `\u001b[1;34m⚡ Background Task: \u001b[1;37m${task?.command || "Task"}\u001b[0m\r\n----------------------------------------\r\n`;
      setSessionOutputs((prev) => ({
        ...prev,
        [activeSessionId]: banner,
      }));
      return;
    }

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

