import { useState, useCallback } from "react";
import { Clipboard } from "../../services/clipboardService";
import { writeTerminalInput } from "../../../../modules/linux-runner/src";

/**
 * Hook for managing terminal shell command history and up/down navigation.
 */
export function useTerminalHistory() {
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  const recordCommand = useCallback((cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;
    setCommandHistory((prev) => {
      const filtered = prev.filter((c) => c !== trimmed);
      return [...filtered, trimmed];
    });
    setHistoryIndex(-1);
  }, []);

  const navigateHistory = useCallback(
    (direction: "up" | "down"): string | null => {
      if (commandHistory.length === 0) return null;

      let newIdx = historyIndex;
      if (direction === "up") {
        if (historyIndex === -1) {
          newIdx = commandHistory.length - 1;
        } else if (historyIndex > 0) {
          newIdx = historyIndex - 1;
        }
      } else {
        if (historyIndex !== -1) {
          if (historyIndex < commandHistory.length - 1) {
            newIdx = historyIndex + 1;
          } else {
            newIdx = -1;
          }
        }
      }

      setHistoryIndex(newIdx);
      return newIdx === -1 ? "" : commandHistory[newIdx] || "";
    },
    [commandHistory, historyIndex]
  );

  return { commandHistory, recordCommand, navigateHistory };
}

/**
 * Hook for terminal copy/paste operations (stripping ANSI codes and formatting).
 */
export function useTerminalClipboard(
  activeSessionId: string,
  sessionOutputs: Record<string, string>,
  showToast: (msg: string) => void
) {
  const copyActiveOutput = useCallback(async () => {
    const text = (sessionOutputs[activeSessionId] || "").replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
    if (text) {
      await Clipboard.setStringAsync(text);
      showToast("Output copied to clipboard");
    }
  }, [sessionOutputs, activeSessionId, showToast]);

  const copyXtermSelection = useCallback(
    async (getSelection: () => Promise<string>) => {
      const text = await getSelection();
      if (text) {
        await Clipboard.setStringAsync(text);
        showToast("Selection copied to clipboard");
      } else {
        showToast("Nothing selected");
      }
    },
    [showToast]
  );

  const pasteFromClipboard = useCallback(async () => {
    const raw = await Clipboard.getStringAsync();
    // Normalize line endings and drop NULs so multi-line pastes execute
    // predictably line-by-line (Termux-style) instead of choking the shell.
    const text = raw.replace(/\r\n?/g, "\n").replace(/\0/g, "");
    if (text) {
      writeTerminalInput(activeSessionId, text);
      showToast("Pasted from clipboard");
    } else {
      showToast("Clipboard is empty");
    }
  }, [activeSessionId, showToast]);

  return { copyActiveOutput, copyXtermSelection, pasteFromClipboard };
}
