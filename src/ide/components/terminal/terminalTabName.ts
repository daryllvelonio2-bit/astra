/**
 * Dynamic shell-tab naming: `N: <program>` derived from what runs in the tab.
 *
 * Shell tabs are born as `N: sh`; nothing renamed them afterwards (the old
 * `formatTabName` was an identity stub). Two feed paths update the name:
 *  - typed input (xterm char stream): accumulated per session until Enter,
 *  - direct commands (legacy pipe mode, Run-button flows): full text known.
 *
 * Task tabs (`task-*`) and the dedicated Run tab keep their own names.
 */

const MAX_PROG_LEN = 14;

/** First meaningful token of a shell command line (skips wrappers/env). */
export function shellProgFromCommand(cmd: string): string {
  const clean = (cmd || "")
    .replace(/^(?:nohup\s+|sudo\s+(?:-u\s+\S+\s+)?|time\s+|env(?:\s+[A-Za-z_][A-Za-z0-9_]*=\S+)+)/i, "")
    .trim();
  if (!clean) return "sh";
  const first = clean.split(/\s+/, 1)[0] || "";
  // Strip quotes, path, and extension: "/usr/bin/python3" -> "python3".
  const base = first.replace(/^['"]|['"]$/g, "").split("/").pop() || "";
  if (!base || base === "." || base === "..") return "sh";
  const short = base.length > MAX_PROG_LEN ? `${base.slice(0, MAX_PROG_LEN - 2)}..` : base;
  return short;
}

export function formatShellTabName(index: number, cmd: string): string {
  return `${index}: ${shellProgFromCommand(cmd)}`;
}

/** Numeric prefix of `N: ...` shell names; null for task/run/custom names. */
export function shellIndexFromName(name: string): number | null {
  const m = /^(\d+):\s/.exec(name || "");
  return m ? parseInt(m[1], 10) : null;
}

/** Next free shell number: max existing + 1 (close-safe, unlike length+1). */
export function nextShellIndex(names: string[]): number {
  let max = 0;
  for (const n of names) {
    const i = shellIndexFromName(n);
    if (i !== null && i > max) max = i;
  }
  return max + 1;
}

/** Sessions whose names this module may rewrite. */
export function isDynamicShellTab(id: string): boolean {
  return !id.startsWith("task-") && id !== "run-session";
}

interface TypedLine {
  buf: string;
  /** True once escape/control bytes appear (TUIs, arrows): not a command. */
  tainted: boolean;
}

/**
 * Fold one chunk of typed input into the session's pending line.
 * Returns the completed command on Enter, null otherwise.
 */
export function foldTypedInput(line: TypedLine | undefined, data: string): { line: TypedLine; done: string | null } {
  let cur: TypedLine = line || { buf: "", tainted: false };
  for (const ch of data) {
    if (ch === "\r" || ch === "\n") {
      const cmd = !cur.tainted ? cur.buf : "";
      cur = { buf: "", tainted: false };
      if (cmd.trim()) return { line: cur, done: cmd };
      continue;
    }
    if (ch === "\x03" || ch === "\x15") {
      // Ctrl+C / Ctrl+U (and the programmatic ^U-clear): discard the line.
      // ^U is tainted so a prefixed `clear` + Enter can't misname the tab.
      cur = { buf: "", tainted: ch === "\x15" };
      continue;
    }
    if (ch === "\x7f" || ch === "\b") {
      cur.buf = cur.buf.slice(0, -1);
      continue;
    }
    const code = ch.charCodeAt(0);
    if (ch === "\x1b" || code < 32 || code === 127) {
      cur.tainted = true;
      continue;
    }
    if (!cur.tainted && cur.buf.length < 256) cur.buf += ch;
    else if (cur.buf.length >= 256) cur.tainted = true;
  }
  return { line: cur, done: null };
}
