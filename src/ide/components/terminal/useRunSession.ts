import { useEffect, useRef } from "react";
import {
  startTerminalSession,
  startPtySession,
  writeTerminalInput,
} from "../../../../modules/linux-runner/src";
import { PTY_XTERM_ENABLED } from "./ptyConfig";
import { ideActionService } from "../../services/ideActionService";
import { RUN_SESSION_ID } from "../../services/runService";
import type { TerminalTab } from "./useTerminalSession";

interface RunSessionHost {
  workspaceId?: string;
  setSessions: React.Dispatch<React.SetStateAction<TerminalTab[]>>;
  setSessionOutputs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setActiveSessionId: (id: string) => void;
  scrollRef: { current: { scrollToEnd: (opts?: object) => void } | null };
  shellIdsRef: { current: string[] };
  bannerFor: (workspaceId?: string) => string;
}

/** Small yield so the PTY slave has time to attach after spawn. */
const PTY_READY_DELAY_MS = 150;

async function startRunShell(sessionId: string, workspaceId?: string) {
  if (PTY_XTERM_ENABLED) {
    await startPtySession(sessionId, workspaceId);
  } else {
    await startTerminalSession(sessionId, workspaceId);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Execute a run command inside the dedicated Run session.
 * Ensures the tab exists, the shell is spawned, waits for PTY readiness,
 * then writes the command. Returns false if the run was aborted.
 */
async function executeRunCommand(
  host: RunSessionHost,
  command: string,
  header?: string,
  ws?: string
): Promise<boolean> {
  const targetWs = ws ?? host.workspaceId;

  // Ensure run tab exists (idempotent push)
  host.setSessions((prev) =>
    prev.some((s) => s.id === RUN_SESSION_ID)
      ? prev
      : [...prev, { id: RUN_SESSION_ID, name: "▶ Run" }]
  );
  host.setSessionOutputs((prev) =>
    prev[RUN_SESSION_ID]
      ? prev
      : { ...prev, [RUN_SESSION_ID]: host.bannerFor(targetWs) }
  );
  if (!host.shellIdsRef.current.includes(RUN_SESSION_ID)) {
    host.shellIdsRef.current.push(RUN_SESSION_ID);
  }
  host.setActiveSessionId(RUN_SESSION_ID);

  // Spawn guest shell (idempotent if already running)
  try {
    await startRunShell(RUN_SESSION_ID, targetWs);
  } catch (_) {}

  // Wait for PTY readiness before writing stdin
  await delay(PTY_READY_DELAY_MS);

  // Write command
  try {
    const safeHeader = (header || "").replace(/'/g, `'\\'\\''`);
    writeTerminalInput(
      RUN_SESSION_ID,
      `${header ? `echo '${safeHeader}'\n` : ""}${command}\n`
    );
  } catch (_) {}

  setTimeout(() => host.scrollRef.current?.scrollToEnd({ animated: true }), 50);
  return true;
}

/**
 * Dedicated Run session for the editor Run button. The tab is created once
 * and reused across runs; each RUN_IN_TERMINAL event focuses it and appends
 * the header + command to the live guest shell.
 *
 * On mount, checks for any pending (sticky) RUN_IN_TERMINAL that was emitted
 * before TerminalView mounted and replays it so no run is ever lost.
 */
export function useRunSessionEffect(host: RunSessionHost) {
  const { workspaceId } = host;
  const runningRef = useRef(false);

  useEffect(() => {
    // Live subscription for future events
    const unsub = ideActionService.subscribe(
      "RUN_IN_TERMINAL",
      async ({ command, header, workspaceId: ws }) => {
        if (runningRef.current) return; // guard against double fire
        runningRef.current = true;
        try {
          await executeRunCommand(host, command, header, ws);
        } finally {
          runningRef.current = false;
        }
      }
    );

    // Replay any pending run event that was emitted before we mounted
    const pending = ideActionService.consumePendingAction("RUN_IN_TERMINAL");
    if (pending) {
      const p = pending.payload;
      if (!runningRef.current) {
        runningRef.current = true;
        executeRunCommand(host, p.command, p.header, p.workspaceId).finally(
          () => { runningRef.current = false; }
        );
      }
    }

    return () => {
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);
}
