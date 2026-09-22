import { useState, useEffect, useMemo, useRef } from "react";
import {
  analyzeCode,
  findMatchingBracket,
  CodeDiagnostic,
  BracketMatch,
} from "../services/codeDiagnosticsService";
import { runBackgroundDiagnostics } from "../services/lsp/nativeLspService";
import { EditorSettings, DEFAULT_EDITOR_SETTINGS } from "../services/configService";

export interface EditorSelection {
  start: number;
  end: number;
}

interface AssistEditResult {
  chunk: string;
  cursor: number;
}

const DIAGNOSTIC_DEBOUNCE_MS = 750;
const CLOSE_FOR: Record<string, string> = {
  "(": ")",
  "[": "]",
  "{": "}",
  '"': '"',
  "'": "'",
  "`": "`",
};

function diffStrings(oldS: string, newS: string): { at: number; removed: string; inserted: string } {
  let at = 0;
  const oldLen = oldS.length;
  const newLen = newS.length;
  const maxScan = Math.min(oldLen, newLen);
  while (at < maxScan && oldS.charCodeAt(at) === newS.charCodeAt(at)) at++;
  let endOld = oldLen;
  let endNew = newLen;
  while (endOld > at && endNew > at && oldS.charCodeAt(endOld - 1) === newS.charCodeAt(endNew - 1)) {
    endOld--;
    endNew--;
  }
  return { at, removed: oldS.slice(at, endOld), inserted: newS.slice(at, endNew) };
}

function indentOfLine(lineText: string): string {
  return lineText.match(/^[ \t]*/)?.[0] || "";
}

function isPythonFile(fileName?: string): boolean {
  const ext = fileName ? (fileName.split(".").pop() || "").toLowerCase() : "";
  return ext === "py" || ext === "pyw";
}

/**
 * Typing assists (auto-close, skip-over, smart indent, pair delete) plus
 * debounced diagnostics and cursor bracket matching for the manual editor.
 * Operates on the visible chunk; EditorView maps chunk offsets to full text.
 */
export function useEditorAssists(
  content: string,
  fileName?: string,
  chunkStartOffset = 0,
  editorSettings: EditorSettings = DEFAULT_EDITOR_SETTINGS
) {
  const [selection, setSelection] = useState<EditorSelection>({ start: 0, end: 0 });
  const [diagnostics, setDiagnostics] = useState<CodeDiagnostic[]>([]);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const settingsRef = useRef(editorSettings);
  settingsRef.current = editorSettings;

  // Synchronous variant for the typing path: rapid onChangeText bursts must
  // anchor diffs on the just-applied cursor, not lagging render state.
  const setSelectionSync = (sel: EditorSelection) => {
    selectionRef.current = sel;
    setSelection(sel);
  };

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const localDiags = analyzeCode(content, fileName);
        if (!cancelled) setDiagnostics(localDiags);

        if (fileName) {
          const bgDiags = await runBackgroundDiagnostics(fileName, content);
          if (!cancelled && bgDiags !== null) {
            setDiagnostics(bgDiags.length > 0 ? bgDiags : localDiags);
          }
        }
      } catch (_) {
        if (!cancelled) setDiagnostics([]);
      }
    }, DIAGNOSTIC_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [content, fileName]);

  const [match, setMatch] = useState<BracketMatch>({ kind: "none" });

  useEffect(() => {
    let cancelled = false;
    // Debounce bracket scan so rapid typing is never interrupted
    const delayMs = content.length > 3000 ? 250 : 150;
    const t = setTimeout(() => {
      try {
        const cursorFull = chunkStartOffset + selection.start;
        if (selection.start !== selection.end) {
          if (!cancelled) setMatch({ kind: "none" });
          return;
        }
        const res = findMatchingBracket(content, cursorFull, fileName);
        if (!cancelled) setMatch(res);
      } catch (_) {
        if (!cancelled) setMatch({ kind: "none" });
      }
    }, delayMs);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [content, fileName, selection.start, selection.end, chunkStartOffset]);

  const matchStatus: string | null = useMemo(() => {
    if (match.kind === "pair") {
      const sameLine = match.openLine === match.closeLine;
      return sameLine
        ? `{ }  line ${match.openLine}`
        : `{ }  L${match.openLine} ↔ L${match.closeLine}`;
    }
    if (match.kind === "unmatched") return `Unmatched bracket · L${match.line}`;
    return null;
  }, [match]);

  const errorCount = useMemo(() => diagnostics.filter((d) => d.severity === "error").length, [diagnostics]);
  const warningCount = useMemo(() => diagnostics.filter((d) => d.severity === "warning").length, [diagnostics]);

  const errorLines = useMemo(() => {
    const map = new Map<number, CodeDiagnostic>();
    for (const d of diagnostics) {
      const prev = map.get(d.line);
      if (!prev || (prev.severity === "warning" && d.severity === "error")) map.set(d.line, d);
    }
    return map;
  }, [diagnostics]);

  const matchLines = useMemo(() => {
    const set = new Set<number>();
    if (match.kind === "pair") {
      set.add(match.openLine);
      set.add(match.closeLine);
    } else if (match.kind === "unmatched") {
      set.add(match.line);
    }
    return set;
  }, [match]);

  const assistEdit = (oldChunk: string, newChunk: string): AssistEditResult => {
    const d = diffStrings(oldChunk, newChunk);
    const sel = selectionRef.current;
    const collapsed = sel.start === sel.end;

    // Anchor the edit at the known cursor when it explains the diff. Pure
    // prefix/suffix diffing misplaces insertions next to identical chars
    // (e.g. typing ) between () looks like an append at the end).
    let at = d.at;
    if (collapsed) {
      const pos = Math.max(0, Math.min(sel.start, oldChunk.length));
      if (d.removed === "" && oldChunk.slice(0, pos) + d.inserted + oldChunk.slice(pos) === newChunk) {
        at = pos;
      } else if (
        d.inserted === "" &&
        pos >= d.removed.length &&
        oldChunk.slice(0, pos - d.removed.length) + oldChunk.slice(pos) === newChunk
      ) {
        at = pos - d.removed.length;
      }
    }

    // Single-char insertion with collapsed cursor: auto-close / skip / indent.
    if (d.inserted.length === 1 && d.removed === "" && collapsed) {
      const typed = d.inserted;
      const cursor = at + 1;
      const settings = settingsRef.current;

      if (typed === "\n") {
        return handleEnter(oldChunk, at);
      }
      if (typed === "\t") {
        const tabSpaces = settings.tabSize === 4 ? "    " : "  ";
        const chunk = newChunk.slice(0, at) + tabSpaces + newChunk.slice(cursor);
        return { chunk, cursor: at + tabSpaces.length };
      }
      if (CLOSE_FOR[typed] && (typed === "(" || typed === "[" || typed === "{")) {
        if (settings.autoCloseBrackets !== false) {
          const chunk = newChunk.slice(0, cursor) + CLOSE_FOR[typed] + newChunk.slice(cursor);
          return { chunk, cursor };
        }
        return { chunk: newChunk, cursor };
      }
      if (typed === '"' || typed === "'" || typed === "`") {
        // Skip over an identical closing quote instead of doubling it.
        if (newChunk[cursor] === typed) {
          const chunk = newChunk.slice(0, at) + newChunk.slice(cursor);
          return { chunk, cursor: at + 1 };
        }
        if (settings.autoCloseQuotes !== false) {
          const chunk = newChunk.slice(0, cursor) + typed + newChunk.slice(cursor);
          return { chunk, cursor };
        }
        return { chunk: newChunk, cursor };
      }
      if (typed === ")" || typed === "]" || typed === "}") {
        if (newChunk[cursor] === typed) {
          // Skip over the auto-inserted closer.
          const chunk = newChunk.slice(0, at) + newChunk.slice(cursor);
          return { chunk, cursor };
        }
      }
      return { chunk: newChunk, cursor };
    }

    // Single-char backspace: delete an auto-inserted pair together.
    if (d.removed.length === 1 && d.inserted === "") {
      const gone = d.removed;
      const pair = CLOSE_FOR[gone];
      if (pair && newChunk[at] === pair && (gone === "(" || gone === "[" || gone === "{" || gone === '"' || gone === "'" || gone === "`")) {
        const chunk = newChunk.slice(0, at) + newChunk.slice(at + 1);
        return { chunk, cursor: at };
      }
      return { chunk: newChunk, cursor: at };
    }

    return { chunk: newChunk, cursor: at + d.inserted.length };
  };

  const handleEnter = (oldChunk: string, at: number): AssistEditResult => {
    const settings = settingsRef.current;
    const lineStart = oldChunk.lastIndexOf("\n", at - 1) + 1;
    const lineSoFar = oldChunk.slice(lineStart, at);
    const base = indentOfLine(lineSoFar);
    const trimmed = lineSoFar.trimEnd();
    const lastCh = trimmed.slice(-1);
    const opener = lastCh === "{" || lastCh === "(" || lastCh === "[";
    const pyColon = isPythonFile(fileName) && trimmed.endsWith(":");
    const indentUnit = settings.tabSize === 4 ? "    " : "  ";
    const extra = settings.autoIndentOnEnter && (opener || pyColon) ? indentUnit : "";
    const effectiveBase = settings.autoIndentOnEnter ? base : "";
    const after = oldChunk.slice(at);
    const afterTrimmed = after.trimStart();

    // VSCode-style: {|}  →  {\n  |\n}
    if (settings.autoIndentOnEnter && opener && (afterTrimmed.startsWith("}") || afterTrimmed.startsWith("]") || afterTrimmed.startsWith(")"))) {
      const chunk =
        oldChunk.slice(0, at) + "\n" + effectiveBase + extra + "\n" + effectiveBase + oldChunk.slice(at).replace(/^[ \t]*/, "");
      return { chunk, cursor: at + 1 + effectiveBase.length + extra.length };
    }
    const chunk = oldChunk.slice(0, at) + "\n" + effectiveBase + extra + oldChunk.slice(at);
    return { chunk, cursor: at + 1 + effectiveBase.length + extra.length };
  };

  return {
    selection,
    setSelection,
    setSelectionSync,
    diagnostics,
    errorLines,
    matchLines,
    match,
    matchStatus,
    errorCount,
    warningCount,
    assistEdit,
  };
}
