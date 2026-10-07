/**
 * Pure terminal-buffer helpers (headlessly testable).
 *
 * Rules that keep the terminal honest:
 * - The buffer NEVER contains a fake shell prompt. The banner is a single
 *   path line only; the real prompt always comes from the shell stream, so `cd`
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

/**
 * The terminal's startup line: the project path, and nothing else.
 *
 * This replaced a fastfetch-style card (ASCII art plus OS / kernel / shell /
 * workspace / terminal / engine rows). Jay asked for it gone — when a terminal
 * opens, the one thing worth showing is where you are, so that is all this
 * prints.
 *
 * The path is the guest path the shell actually starts in: ProotSessionConfig
 * binds the host workspaces directory to /workspaces, so this is the same string
 * a `pwd` prints immediately after startup. Plain grey, no box drawing, so the
 * first real prompt follows it without a wall of decoration in between.
 */
export function getBannerPath(workspaceId?: string): string {
  const dir = workspaceId ? `/workspaces/${workspaceId}` : "/workspace";
  return `\u001b[90m${dir}\u001b[0m\r\n`;
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

/**
 * Run-completion markers. buildRunnerScript echoes a line of the form
 * `__ASTRA_NOTIFY__<label>|<exit code>|<duration>` as the very last output
 * of a Run; the terminal strips it before painting and raises a global
 * notification instead. Line-based so a label can never smuggle a false
 * terminator.
 */
export interface RunMarker {
  label: string;
  code: number;
  duration: string;
}

const RUN_MARKER_PREFIX = "__ASTRA_NOTIFY__";

/** Remove marker lines without firing callbacks (history replay). */
export function stripRunMarkersSilently(text: string): string {
  if (!text || !text.includes(RUN_MARKER_PREFIX)) return text;
  return text
    .split("\n")
    .filter((line) => !line.startsWith(RUN_MARKER_PREFIX))
    .join("\n");
}

export function createRunMarkerScanner(onMarker: (marker: RunMarker) => void): {
  feed: (chunk: string) => string;
  flush: () => string;
} {
  let held = "";
  const parse = (line: string): RunMarker | null => {
    const payload = line.slice(RUN_MARKER_PREFIX.length);
    const last = payload.lastIndexOf("|");
    const mid = payload.lastIndexOf("|", last - 1);
    if (last <= 0 || mid < 0) return null;
    const code = parseInt(payload.slice(mid + 1, last), 10);
    if (Number.isNaN(code)) return null;
    return { label: payload.slice(0, mid), code, duration: payload.slice(last + 1) };
  };
  return {
    feed(chunk) {
      const text = held + chunk;
      const lines = text.split("\n");
      const tail = lines.pop() ?? "";
      let out = "";
      for (const line of lines) {
        if (line.startsWith(RUN_MARKER_PREFIX)) {
          const marker = parse(line);
          if (marker) onMarker(marker);
          continue;
        }
        out += line + "\n";
      }
      // Hold the tail while it could still grow into a marker line: either it
      // already starts with the full prefix (trailing \n in the next chunk) or
      // it is a strict prefix of it (the marker was split MID-PREFIX — without
      // this branch the second chunk's fragment no longer starts with the
      // prefix, so it paints as garbage and the run never notifies). The cost
      // is a bounded stall: divergence flushes on the next byte (typing
      // `__init__.py` holds `__i` then paints `__init…` immediately).
      if (tail.startsWith(RUN_MARKER_PREFIX) || RUN_MARKER_PREFIX.startsWith(tail)) {
        held = tail;
      } else {
        held = "";
        out += tail;
      }
      return out;
    },
    flush() {
      const rest = held;
      held = "";
      return rest.startsWith(RUN_MARKER_PREFIX) ? "" : rest;
    },
  };
}


