import { useRef, useCallback } from "react";
import {
  foldTypedInput,
  formatShellTabName,
  isDynamicShellTab,
  shellIndexFromName,
  shellProgFromCommand,
} from "./terminalTabName";
import type { TerminalTab } from "./useTerminalSession";

type SetSessions = React.Dispatch<React.SetStateAction<TerminalTab[]>>;

/**
 * Owns dynamic shell-tab names so useTerminalSession stays under the
 * 500-line cap. Tracks half-typed lines per session (xterm char stream),
 * renames `N: sh` -> `N: <program>` on Enter or direct command runs.
 */
export function useTerminalTabNames(setSessions: SetSessions) {
  const lineRef = useRef<Record<string, { buf: string; tainted: boolean }>>({});

  const renameShellTab = useCallback(
    (sid: string, prog: string) => {
      if (!isDynamicShellTab(sid) || !prog) return;
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sid) return s;
          const idx = shellIndexFromName(s.name);
          if (idx === null) return s;
          const next = `${idx}: ${prog}`;
          return next === s.name ? s : { ...s, name: next };
        })
      );
    },
    [setSessions]
  );

  /** Feed typed/written bytes; renames the tab when a command completes. */
  const trackTypedInput = useCallback(
    (sid: string, data: string) => {
      if (!isDynamicShellTab(sid) || !data) return;
      const { line, done } = foldTypedInput(lineRef.current[sid], data);
      lineRef.current[sid] = line;
      if (done) renameShellTab(sid, shellProgFromCommand(done));
    },
    [renameShellTab]
  );

  /** Rename from a known full command (legacy mode, direct runs). */
  const renameForCommand = useCallback(
    (sid: string, cmd: string) => {
      if (!isDynamicShellTab(sid)) return;
      renameShellTab(sid, shellProgFromCommand(cmd));
    },
    [renameShellTab]
  );

  /** Tab label for a fresh shell with the given index. */
  const freshShellName = useCallback((index: number) => formatShellTabName(index, "sh"), []);

  /** Forget a closed session's pending line. */
  const dropTracked = useCallback((sid: string) => {
    delete lineRef.current[sid];
  }, []);

  return { trackTypedInput, renameForCommand, renameShellTab, freshShellName, dropTracked };
}
