import { useState, useCallback, useEffect } from "react";
import { TerminalTab } from "./useTerminalSession";

export type TerminalPane = "primary" | "secondary";

interface UseSplitTerminalProps {
  sessions: TerminalTab[];
  activeSessionId: string;
  onAddSession: () => void;
}

export function useSplitTerminal({
  sessions,
  activeSessionId,
  onAddSession,
}: UseSplitTerminalProps) {
  const [isSplit, setIsSplit] = useState<boolean>(false);
  const [splitSessionId, setSplitSessionId] = useState<string | null>(null);
  const [focusedPane, setFocusedPane] = useState<TerminalPane>("primary");
  const [pendingSplit, setPendingSplit] = useState<boolean>(false);

  // When pending split and second session arrives, activate split
  useEffect(() => {
    if (pendingSplit && sessions.length >= 2) {
      const other = sessions.find((s) => s.id !== activeSessionId) || sessions[1];
      setSplitSessionId(other.id);
      setIsSplit(true);
      setFocusedPane("secondary");
      setPendingSplit(false);
    }
  }, [pendingSplit, sessions, activeSessionId]);

  // Keep split session valid if sessions change
  useEffect(() => {
    if (!isSplit) return;
    if (sessions.length < 2) {
      if (!pendingSplit) {
        setIsSplit(false);
        setSplitSessionId(null);
        setFocusedPane("primary");
      }
      return;
    }
    const exists = sessions.some((s) => s.id === splitSessionId);
    if (!exists) {
      const fallback = sessions.find((s) => s.id !== activeSessionId);
      if (fallback) {
        setSplitSessionId(fallback.id);
      } else {
        setIsSplit(false);
        setSplitSessionId(null);
        setFocusedPane("primary");
      }
    }
  }, [sessions, activeSessionId, isSplit, splitSessionId, pendingSplit]);

  const toggleSplit = useCallback(() => {
    if (isSplit || pendingSplit) {
      setIsSplit(false);
      setPendingSplit(false);
      setFocusedPane("primary");
    } else {
      if (sessions.length < 2) {
        // Need a second session to split
        setPendingSplit(true);
        onAddSession();
      } else {
        const other = sessions.find((s) => s.id !== activeSessionId) || sessions[0];
        setSplitSessionId(other.id);
        setIsSplit(true);
        setFocusedPane("secondary");
      }
    }
  }, [isSplit, pendingSplit, sessions, activeSessionId, onAddSession]);

  const closeSplit = useCallback(() => {
    setIsSplit(false);
    setPendingSplit(false);
    setFocusedPane("primary");
  }, []);

  return {
    isSplit,
    splitSessionId,
    setSplitSessionId,
    focusedPane,
    setFocusedPane,
    toggleSplit,
    closeSplit,
  };
}
