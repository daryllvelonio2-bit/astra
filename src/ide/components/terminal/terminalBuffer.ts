/**
 * Pure terminal-buffer helpers (headlessly testable).
 *
 * Rules that keep the terminal honest:
 * - The buffer NEVER contains a fake shell prompt. The banner is a title
 *   line only; the real prompt always comes from the shell stream, so `cd`
 *   directory changes always display.
 * - Native history merges are delta-only appends. Replacing the buffer with
 *   native history wipes locally-echoed command lines (the shell has no tty
 *   echo on pipes) and resurrects stale text — both made output "disappear".
 */

export const TERMINAL_BUFFER_CAP = 100000;
export const TERMINAL_BUFFER_KEEP = 80000;
// A native history shorter than this after a shrink means "session restarted"
// rather than "native buffer trimmed".
const RESTART_CEILING = 4096;

const ASTRA_ART = [
  "    _    ____ _____ ____      _    ",
  "   / \\  / ___|_   _|  _ \\    / \\   ",
  "  / _ \\ \\___ \\ | | | |_) |  / _ \\  ",
  " / ___ \\ ___) || | |  _ <  / ___ \\ ",
  "/_/   \\_\\____/ |_| |_| \\_\\/_/   \\_\\",
];

const SEP = "-----------------------------------";

export function getBannerTitle(workspaceId?: string, isDark: boolean = true): string {
  const dir = workspaceId ? `/workspaces/${workspaceId}` : "/workspace";
  const R = "\u001b[0m";

  // Vibrant, high-contrast palette
  const artColor = isDark ? "\u001b[1;36m" : "\u001b[1;34m";
  const userColor = "\u001b[1;32m";
  const hostColor = isDark ? "\u001b[1;36m" : "\u001b[1;34m";
  const dimColor = "\u001b[90m";

  // Metric icon colors
  const cOs = "\u001b[1;36m";
  const cKer = "\u001b[1;35m";
  const cSh = "\u001b[1;33m";
  const cWs = "\u001b[1;34m";
  const cTerm = "\u001b[1;32m";
  const cEng = "\u001b[1;31m";

  // Labels: bold high-contrast
  const L = isDark ? "\u001b[1;37m" : "\u001b[1;30m";

  const lines = [
    `${artColor}${ASTRA_ART[0]}${R}`,
    `${artColor}${ASTRA_ART[1]}${R}`,
    `${artColor}${ASTRA_ART[2]}${R}`,
    `${artColor}${ASTRA_ART[3]}${R}`,
    `${artColor}${ASTRA_ART[4]}${R}`,
    ``,
    `${userColor}astra${R}@${hostColor}debian${R}`,
    `${dimColor}──────────────────────────────────────────${R}`,
    `  ${cOs}▲${R}  ${L}OS:${R}         Debian Linux (PRoot sandbox)`,
    `  ${cKer}◉${R}  ${L}Kernel:${R}     Linux userland (embedded)`,
    `  ${cSh}⚡${R} ${L}Shell:${R}      bash`,
    `  ${cWs}📁${R} ${L}Workspace:${R}  ${cWs}${dir}${R}`,
    `  ${cTerm}💻${R} ${L}Terminal:${R}   xterm.js pty`,
    `  ${cEng}🚀${R} ${L}Engine:${R}     PRoot + glibc`,
    ``,
    `  \u001b[31m● \u001b[32m● \u001b[33m● \u001b[34m● \u001b[35m● \u001b[36m● \u001b[37m● \u001b[90m●${R}`,
  ];
  return lines.join("\r\n") + "\r\n";
}
export function appendCapped(current: string, chunk: string): string {
  if (!chunk) return current;
  const updated = current + chunk;
  return updated.length > TERMINAL_BUFFER_CAP ? updated.slice(-TERMINAL_BUFFER_KEEP) : updated;
}

export interface HistoryMerge {
  text: string;
  seen: number;
}

/**
 * Fold a native full-history snapshot into the local buffer, appending only
 * unseen tail bytes. Never deletes local content (typed echoes, banner).
 */
export function mergeNativeHistory(current: string, hist: string, seen: number): HistoryMerge {
  if (!hist) return { text: current, seen };
  if (hist.length < seen) {
    // Native buffer shrank: trim-resync (stay quiet) or restarted (adopt).
    if (hist.length > RESTART_CEILING) return { text: current, seen: hist.length };
    seen = 0;
  }
  if (hist.length <= seen) return { text: current, seen };
  return { text: appendCapped(current, hist.slice(seen)), seen: hist.length };
}

/**
 * Shared native-text differ: calculates removed and added text against the
 * last observed native text without wiping the buffer mid-word.
 */
export function diffNativeText(prev: string, text: string): { removed: number; added: string } {
  let i = 0;
  while (i < prev.length && i < text.length && prev[i] === text[i]) i++;
  let removed = prev.length - i;
  const added = text.slice(i);
  if (prev.startsWith(" ") && !text.startsWith(" ") && i === 0) {
    removed = Math.max(0, removed - 1);
  }
  return { removed, added };
}

/**
 * Strips leaked internal export commands (COLORFGBG, COLORTERM, TERM_PROGRAM)
 * and non-tty warnings from terminal outputs and history replay.
 * NOTE: this must NOT strip device queries/replies — live fullscreen apps
 * need those answered. Replay-only sanitizing lives in stripReplayQueries.
 */
export function stripLeakedTerminalText(text: string): string {
  if (!text) return "";
  return text
    .replace(/\/bin\/sh:\s*can't access tty;\s*job control turned off\r?\n?/g, "")
    .replace(/(?:^|\r?\n)(?:[^\r\n]*[#$]\s*)?export\s+COLORFGBG=[^\r\n]*(?:\r?\n|$)/gi, "\r\n")
    .replace(/^export\s+COLORFGBG=[^\r\n]*(?:\r?\n|$)/gim, "")
    .replace(/\r\n\r\n\r\n/g, "\r\n\r\n");
}

/**
 * Replay-only sanitizer: removes terminal device queries and their replies
 * (cursor-position reports `ESC[{row};{col}R`, device attributes `ESC[?..c`,
 * status reports `ESC[..n`, kitty keyboard probes `ESC[?..u`) from history
 * snapshots BEFORE they are painted into a fresh xterm grid.
 *
 * Why replay-only: when a snapshot containing a stale query (e.g. `\x1b[6n`
 * a TUI printed long ago) is re-fed to xterm, xterm dutifully answers it —
 * and that stale answer lands in the NEW shell's stdin as ghost input.
 * Live streams are never passed through here: a live fullscreen app's own
 * queries must reach xterm AND xterm's answers must reach the shell,
 * otherwise the app hangs forever on a blank screen waiting for a reply
 * that was swallowed.
 */
export function stripReplayQueries(text: string): string {
  if (!text) return "";
  return text
    .replace(/\x1b\[\??[0-9;]*[Rcn]/g, "")
    .replace(/\x1b\[\?[0-9;]*u/g, "");
}


