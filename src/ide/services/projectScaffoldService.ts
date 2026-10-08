import {
  executeCommandStream,
  addCommandOutputListener,
  stopCommand,
  isEnvironmentReady,
} from "../../../modules/linux-runner/src";
import { ProjectTemplate } from "./projectTemplates";

/**
 * Runs a template's non-interactive scaffold commands in the guest, in the
 * project's own folder, and reports progress.
 *
 * This adds NO new execution path: it uses the exact three helpers the git
 * clone flow already uses — `executeCommandStream` (streaming),
 * `addCommandOutputListener` (live lines) and `stopCommand` (cancel). The
 * workspace id is passed as the cwd argument, so the guest resolves the real
 * project folder (default or "Specific Directory") through the same registry
 * the terminal uses.
 *
 * Failures are turned into a short, human sentence — never a raw shell blob.
 */

export interface ScaffoldResult {
  ok: boolean;
  error?: string;
  /** Trimmed output lines captured (bounded). */
  log: string[];
}

let activeScaffoldId: string | null = null;

/** Stops an in-flight scaffold (best-effort kill of the guest subtree). */
export function cancelScaffold(): boolean {
  if (!activeScaffoldId) return false;
  const id = activeScaffoldId;
  activeScaffoldId = null;
  try {
    return stopCommand(id);
  } catch (_) {
    return false;
  }
}

/** Turn raw shell output into a short, actionable failure line. */
export function friendlyScaffoldError(output: string, templateName: string): string {
  const t = (output || "").trim();
  if (/command not found|not found/i.test(t)) {
    return `${templateName} needs a tool that is not installed yet. Install it above, then try again.`;
  }
  if (/no space left|not enough space/i.test(t)) {
    return `Not enough free storage to create this ${templateName} project.`;
  }
  if (/ENOTFOUND|could not resolve host|network|timed out|ETIMEDOUT|temporary failure in name resolution|connection refused/i.test(t)) {
    return "Network error while downloading — check your connection and try again.";
  }
  if (/permission denied|read-only file system/i.test(t)) {
    return "The project folder could not be written to. Check the workspace location and try again.";
  }
  const tail = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(-3).join("\n");
  return tail ? `${templateName} could not be created:\n${tail}` : `${templateName} could not be created.`;
}

/**
 * Scaffold a template into `workspaceId`'s folder. Manual templates and blank
 * (no commands) return immediately. OnProgress streams trimmed lines.
 */
export async function scaffoldProject(
  template: ProjectTemplate,
  workspaceId: string,
  onProgress?: (line: string) => void
): Promise<ScaffoldResult> {
  const log: string[] = [];
  const emit = (line: string) => {
    const s = (line || "").trim();
    if (!s) return;
    log.push(s);
    if (log.length > 400) log.shift();
    onProgress?.(s);
  };

  if (template.manual) {
    return { ok: false, error: template.manualReason || "This template cannot be scaffolded here.", log };
  }
  if (template.commands.length === 0) {
    return { ok: true, log };
  }

  // Do not run into a guest that was never provisioned — the first command
  // would fail with a bare "sh: not found" instead of an actionable message.
  try {
    if (!(await isEnvironmentReady())) {
      return {
        ok: false,
        error: "The Linux environment is not set up yet. Open Settings → Linux, finish setup, then try again.",
        log,
      };
    }
  } catch (_) {
    // Fall through and let the command itself report the real problem.
  }

  for (const cmd of template.commands) {
    const firstLine = cmd.split("\n")[0];
    emit(`$ ${firstLine}${cmd.includes("\n") ? " …" : ""}`);

    // Timestamp+id keeps two commands from colliding on one listener key.
    const commandId = `scaffold-${template.id}-${Date.now()}-${log.length}`;
    let listener: { remove: () => void } | undefined;
    activeScaffoldId = commandId;
    if (onProgress) {
      listener = addCommandOutputListener(commandId, (chunk: string) => {
        for (const seg of chunk.split(/\r?\n/)) emit(seg);
      });
    }

    let out = "";
    let code = -1;
    try {
      const res = await executeCommandStream(commandId, cmd, workspaceId);
      out = res.stdout || "";
      code = res.exitCode;
    } catch (e: any) {
      listener?.remove();
      if (activeScaffoldId === commandId) activeScaffoldId = null;
      return { ok: false, error: friendlyScaffoldError(e?.message || "", template.name) || "Scaffolding failed.", log };
    } finally {
      listener?.remove();
      if (activeScaffoldId === commandId) activeScaffoldId = null;
    }

    if (code !== 0) {
      return { ok: false, error: friendlyScaffoldError(out || log.join("\n"), template.name), log };
    }
  }

  return { ok: true, log };
}
