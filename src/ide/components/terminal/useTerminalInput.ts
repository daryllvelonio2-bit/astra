import { useState, useRef, useEffect, useCallback } from "react";
import { TextInput, DeviceEventEmitter, Keyboard } from "react-native";
import { diffNativeText } from "./terminalBuffer";
import { ideActionService } from "../../services/ideActionService";

interface UseTerminalInputOptions {
  isXterm: boolean;
  sendInput: (data: string) => void;
  runCommandDirectly: (cmd: string) => void;
  navigateHistory: (direction: "up" | "down") => string | null;
  isCtrlActive: boolean;
  isAltActive: boolean;
  setIsCtrlActive: (active: boolean | ((prev: boolean) => boolean)) => void;
  setIsAltActive: (active: boolean | ((prev: boolean) => boolean)) => void;
  activeSessionId: string;
  keyboardMouseMode?: boolean;
}

const ASCII_SHORTCUTS: Record<string, string> = {
  "\x05": "Ctrl+E",
  "\x14": "Ctrl+T",
  "\x02": "Ctrl+B",
  "\x07": "Ctrl+G",
};

export function useTerminalInput({
  isXterm,
  sendInput,
  runCommandDirectly,
  navigateHistory,
  isCtrlActive,
  isAltActive,
  setIsCtrlActive,
  setIsAltActive,
  activeSessionId,
  keyboardMouseMode = false,
}: UseTerminalInputOptions) {
  const [currentInput, setCurrentInput] = useState<string>("");
  const [isFocused, setIsFocused] = useState<boolean>(true);
  const inputRef = useRef<TextInput>(null);
  const lastTapRef = useRef<number>(0);
  const currentInputRef = useRef<string>("");

  const setEchoInput = useCallback((next: string) => {
    currentInputRef.current = next;
    setCurrentInput(next);
  }, []);

  const lastNativeRef = useRef<string>(" ");
  const isResettingRef = useRef<boolean>(false);

  const resetCatcher = useCallback(() => {
    isResettingRef.current = true;
    lastNativeRef.current = " ";
    try {
      inputRef.current?.clear();
    } catch (_) {}
    try {
      inputRef.current?.setNativeProps({ text: " " });
    } catch (_) {}
    setTimeout(() => {
      isResettingRef.current = false;
    }, 100);
  }, []);

  const handleFocusTerminal = useCallback(() => {
    setIsFocused(true);
    inputRef.current?.blur();
    inputRef.current?.focus();
  }, []);

  const handleDoubleTap = useCallback(() => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 450;
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      handleFocusTerminal();
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  }, [handleFocusTerminal]);

  const lastEnterTimeRef = useRef<number>(0);
  const submitCurrentInput = useCallback(() => {
    const now = Date.now();
    if (now - lastEnterTimeRef.current < 150) return;
    lastEnterTimeRef.current = now;
    const cmd = currentInputRef.current;
    setEchoInput("");
    if (cmd.trim()) {
      runCommandDirectly(cmd);
    } else {
      sendInput("\n");
    }
    resetCatcher();
  }, [runCommandDirectly, sendInput, resetCatcher, setEchoInput]);

  const sendEnter = useCallback(() => {
    const now = Date.now();
    if (now - lastEnterTimeRef.current < 150) return;
    lastEnterTimeRef.current = now;
    if (isXterm) {
      sendInput("\r");
    } else {
      submitCurrentInput();
    }
    resetCatcher();
    if (keyboardMouseMode) {
      Keyboard.dismiss();
    }
  }, [isXterm, sendInput, submitCurrentInput, resetCatcher, keyboardMouseMode]);

  useEffect(() => {
    if (keyboardMouseMode) {
      Keyboard.dismiss();
      const sub = Keyboard.addListener("keyboardDidShow", () => {
        Keyboard.dismiss();
      });
      return () => sub.remove();
    }
  }, [keyboardMouseMode]);

  const handlePipeInput = useCallback(
    (text: string) => {
      const { removed, added } = diffNativeText(lastNativeRef.current, text);

      let echo = currentInputRef.current;
      if (removed > 0) echo = echo.slice(0, Math.max(0, echo.length - removed));

      if (added.includes("\n") || added.includes("\r")) {
        const parts = added.split(/[\n\r]+/);
        const trailingPartial = /[\n\r]$/.test(added) ? "" : (parts.pop() as string);
        setIsCtrlActive(false);
        setIsAltActive(false);
        for (const seg of parts) {
          setEchoInput(echo + seg);
          submitCurrentInput();
          echo = "";
        }
        setEchoInput(echo + trailingPartial);
        resetCatcher();
        return;
      }

      if (ASCII_SHORTCUTS[added]) {
        DeviceEventEmitter.emit("onHardwareShortcut", ASCII_SHORTCUTS[added]);
        resetCatcher();
        return;
      }

      if (added.length === 1 && (isCtrlActive || isAltActive)) {
        if (removed > 0) setEchoInput(echo);
        if (isCtrlActive && added.toUpperCase() === "C") setEchoInput("");
        sendInput(added);
        resetCatcher();
        return;
      }

      if (added || removed > 0) {
        if (added) {
          setIsCtrlActive(false);
          setIsAltActive(false);
          setEchoInput(echo + added);
        } else {
          setEchoInput(echo);
        }
      }

      if (text === "") {
        resetCatcher();
      } else {
        lastNativeRef.current = text;
      }
    },
    [isCtrlActive, isAltActive, setIsCtrlActive, setIsAltActive, setEchoInput, submitCurrentInput, sendInput, resetCatcher]
  );

  const handleXtermInput = useCallback(
    (text: string) => {
      const { removed, added } = diffNativeText(lastNativeRef.current, text);

      if (ASCII_SHORTCUTS[added]) {
        DeviceEventEmitter.emit("onHardwareShortcut", ASCII_SHORTCUTS[added]);
        resetCatcher();
        return;
      }

      if (removed > 0) {
        sendInput("\x7f".repeat(Math.min(removed, 256)));
      }

      if (added.includes("\n") || added.includes("\r")) {
        const parts = added.split(/[\r\n]+/);
        const trailing = /[\r\n]$/.test(added) ? "" : parts.pop() || "";
        for (const seg of parts) {
          if (seg) sendInput(seg);
          sendEnter();
        }
        if (trailing) sendInput(trailing);
        return;
      }

      if (added.length === 1 && (isCtrlActive || isAltActive)) {
        sendInput(added);
        resetCatcher();
        return;
      }

      if (added) {
        sendInput(added);
      }

      if (text === "") {
        resetCatcher();
      } else {
        lastNativeRef.current = text;
      }
    },
    [isCtrlActive, isAltActive, sendInput, sendEnter, resetCatcher]
  );

  const handleDirectInput = useCallback(
    (text: string) => {
      if (isResettingRef.current && (text === "" || text === " ")) {
        return;
      }
      if (isXterm) {
        handleXtermInput(text);
        return;
      }
      handlePipeInput(text);
    },
    [isXterm, handleXtermInput, handlePipeInput]
  );

  const handleExtraPrintable = useCallback(
    (ch: string) => {
      if (isXterm || isCtrlActive || isAltActive) {
        sendInput(ch);
      } else {
        setEchoInput(currentInputRef.current + ch);
      }
      handleFocusTerminal();
    },
    [isXterm, isCtrlActive, isAltActive, sendInput, setEchoInput, handleFocusTerminal]
  );

  const handleExtraRaw = useCallback(
    (data: string) => {
      if (!isXterm && data === "\t" && currentInputRef.current) {
        setIsCtrlActive(false);
        setIsAltActive(false);
        sendInput(`${currentInputRef.current}\t`);
        return;
      }
      setIsCtrlActive(false);
      setIsAltActive(false);
      sendInput(data);
      handleFocusTerminal();
    },
    [isXterm, setIsCtrlActive, setIsAltActive, sendInput, handleFocusTerminal]
  );

  const handleExtraEnter = useCallback(() => {
    sendEnter();
  }, [sendEnter]);

  const handleKeyPress = useCallback(
    (e: any) => {
      const key = e.nativeEvent?.key;
      const isCtrl = e.nativeEvent?.ctrlKey || e.nativeEvent?.metaKey;
      if (isCtrl) {
        const lower = (key || "").toLowerCase();
        if (lower === "e") { DeviceEventEmitter.emit("onHardwareShortcut", "Ctrl+E"); return; }
        if (lower === "t") { DeviceEventEmitter.emit("onHardwareShortcut", "Ctrl+T"); return; }
        if (lower === "b") { DeviceEventEmitter.emit("onHardwareShortcut", "Ctrl+B"); return; }
        if (lower === "g") { DeviceEventEmitter.emit("onHardwareShortcut", "Ctrl+G"); return; }
      } else if (key && ASCII_SHORTCUTS[key]) {
        DeviceEventEmitter.emit("onHardwareShortcut", ASCII_SHORTCUTS[key]);
        return;
      }
      if (isXterm) {
        if (key === "ArrowUp") sendInput("\x1b[A");
        else if (key === "ArrowDown") sendInput("\x1b[B");
        else if (key === "ArrowRight") sendInput("\x1b[C");
        else if (key === "ArrowLeft") sendInput("\x1b[D");
        return;
      }
      if (key === "Enter") {
        submitCurrentInput();
      } else if (key === "ArrowUp") {
        const prevCmd = navigateHistory("up");
        if (prevCmd !== null) {
          setEchoInput(prevCmd);
        }
      } else if (key === "ArrowDown") {
        const nextCmd = navigateHistory("down");
        if (nextCmd !== null) {
          setEchoInput(nextCmd);
        }
      }
    },
    [isXterm, sendInput, submitCurrentInput, navigateHistory, setEchoInput]
  );

  const clearInput = useCallback(() => {
    resetCatcher();
    setEchoInput("");
  }, [resetCatcher, setEchoInput]);

  useEffect(() => {
    clearInput();
  }, [activeSessionId, clearInput]);

  useEffect(() => {
    const unsub = ideActionService.subscribe("RUN_IN_TERMINAL", () => {
      clearInput();
    });
    return unsub;
  }, [clearInput]);

  return {
    currentInput,
    isFocused,
    setIsFocused,
    inputRef,
    resetCatcher,
    handleFocusTerminal,
    handleDoubleTap,
    handleDirectInput,
    handleKeyPress,
    sendEnter,
    handleExtraPrintable,
    handleExtraRaw,
    handleExtraEnter,
    clearInput,
  };
}
