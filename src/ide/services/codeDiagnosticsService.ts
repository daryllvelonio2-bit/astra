/**
 * Offline code intelligence: syntax/bracket diagnostics + bracket matching.
 * - TS/JS/JSX/TSX: real parse via the bundled TypeScript compiler (syntax only).
 * - JSON: native parse with position mapping.
 * - Python: indent/colon checks + bracket scan.
 * - Everything else: string/comment-aware bracket scan.
 * Pure functions, no native deps. Results capped for mobile perf.
 */

export interface CodeDiagnostic {
  line: number;
  col: number;
  endLine?: number;
  endCol?: number;
  message: string;
  severity: "error" | "warning";
  source: "ts" | "json" | "python" | "brackets" | string;
}

export type BracketMatch =
  | { kind: "pair"; openLine: number; openCol: number; closeLine: number; closeCol: number }
  | { kind: "unmatched"; line: number; col: number }
  | { kind: "none" };

const MAX_ANALYZE_CHARS = 150_000;
const MAX_DIAGNOSTICS = 50;

const OPENERS = new Set(["(", "[", "{"]);
const CLOSERS = new Set([")", "]", "}"]);
const PAIRS: Record<string, string> = { "(": ")", "[": "]", "{": "}" };

type LangMode = "cstyle" | "python";

function langModeFor(fileName?: string): LangMode {
  const ext = fileName ? (fileName.split(".").pop() || "").toLowerCase() : "";
  return ext === "py" || ext === "pyw" ? "python" : "cstyle";
}

function extOf(fileName?: string): string {
  return fileName ? (fileName.split(".").pop() || "").toLowerCase() : "";
}

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

function offsetToLineCol(starts: number[], offset: number): { line: number; col: number } {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, col: offset - starts[lo] + 1 };
}

interface BracketPair {
  open: number;
  close: number;
}

interface ScanResult {
  pairs: BracketPair[];
  diagnostics: CodeDiagnostic[];
}

/**
 * Single-pass string/comment-aware bracket scan.
 */
export function scanBrackets(text: string, mode: LangMode, hashComments = false): ScanResult {
  const starts = lineStarts(text);
  const pairs: BracketPair[] = [];
  const diagnostics: CodeDiagnostic[] = [];
  const stack: { ch: string; offset: number }[] = [];
  // Template-expression brace depth (cstyle backticks only).
  const tmplStack: number[] = [];
  let inTemplate = false;
  let state: "code" | "lineComment" | "blockComment" | "string" = "code";
  let strQuote = "";
  let strStart = 0;
  let triple = false;

  const push = (d: CodeDiagnostic) => {
    if (diagnostics.length < MAX_DIAGNOSTICS) diagnostics.push(d);
  };
  const loc = (offset: number) => offsetToLineCol(starts, offset);

  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const next = i + 1 < text.length ? text[i + 1] : "";
    const next2 = i + 2 < text.length ? text[i + 2] : "";

    if (state === "lineComment") {
      if (ch === "\n") state = "code";
      i++;
      continue;
    }
    if (state === "blockComment") {
      if (ch === "*" && next === "/") {
        state = "code";
        i += 2;
      } else {
        i++;
      }
      continue;
    }
    if (state === "string") {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (triple) {
        if (ch === strQuote && next === strQuote && next2 === strQuote) {
          state = "code";
          i += 3;
        } else {
          i++;
        }
        continue;
      }
      if (ch === strQuote) {
        state = "code";
        i++;
        continue;
      }
      if (ch === "\n" && (strQuote === "'" || strQuote === '"') && mode === "cstyle") {
        const p = loc(strStart);
        push({ line: p.line, col: p.col, message: "Unterminated string literal", severity: "error", source: "brackets" });
        state = "code";
        i++;
        continue;
      }
      if (ch === "\n" && mode === "python") {
        const p = loc(strStart);
        push({ line: p.line, col: p.col, message: "Unterminated string literal", severity: "error", source: "brackets" });
        state = "code";
        i++;
        continue;
      }
      i++;
      continue;
    }

    // state === "code"
    if (mode === "python") {
      if (ch === "#") {
        state = "lineComment";
        i++;
        continue;
      }
      if ((ch === "'" || ch === '"') && next === ch && next2 === ch) {
        state = "string";
        strQuote = ch;
        strStart = i;
        triple = true;
        i += 3;
        continue;
      }
      if (ch === "'" || ch === '"') {
        state = "string";
        strQuote = ch;
        strStart = i;
        triple = false;
        i++;
        continue;
      }
    } else {
      if (ch === "/" && next === "/") {
        state = "lineComment";
        i += 2;
        continue;
      }
      if (ch === "/" && next === "*") {
        state = "blockComment";
        i += 2;
        continue;
      }
      if (ch === "#" && hashComments) {
        state = "lineComment";
        i++;
        continue;
      }
      if (ch === "'" || ch === '"') {
        state = "string";
        strQuote = ch;
        strStart = i;
        triple = false;
        i++;
        continue;
      }
      if (ch === "`") {
        state = "string";
        strQuote = "`";
        strStart = i;
        triple = false;
        inTemplate = true;
        tmplStack.push(0);
        i++;
        continue;
      }
      // Inside template literal: ${ opens an expression brace.
      if (inTemplate && state === "code" && ch === "$" && next === "{") {
        stack.push({ ch: "{", offset: i + 1 });
        tmplStack[tmplStack.length - 1]++;
        i += 2;
        continue;
      }
    }

    if (OPENERS.has(ch)) {
      stack.push({ ch, offset: i });
    } else if (CLOSERS.has(ch)) {
      // A } that closes a ${ expression returns to template-string state.
      if (inTemplate && ch === "}" && tmplStack.length > 0 && tmplStack[tmplStack.length - 1] > 0) {
        const top = stack[stack.length - 1];
        if (top && top.ch === "{") {
          pairs.push({ open: top.offset, close: i });
          stack.pop();
          tmplStack[tmplStack.length - 1]--;
          i++;
          continue;
        }
      }
      const top = stack[stack.length - 1];
      if (top && PAIRS[top.ch] === ch) {
        // Don't pair a template ${ brace with a plain-code closer mismatch.
        pairs.push({ open: top.offset, close: i });
        stack.pop();
      } else {
        const p = loc(i);
        const expected = top ? `"${PAIRS[top.ch]}"` : "nothing";
        push({
          line: p.line,
          col: p.col,
          message: `Mismatched "${ch}" — ${expected} is open${top ? ` (line ${loc(top.offset).line})` : ""}`,
          severity: "error",
          source: "brackets",
        });
      }
    }
    i++;
  }

  if (state === "string" && triple) {
    const p = loc(strStart);
    push({ line: p.line, col: p.col, message: "Unterminated multi-line string", severity: "error", source: "brackets" });
  } else if (state === "string" && (strQuote === "`")) {
    const p = loc(strStart);
    push({ line: p.line, col: p.col, message: "Unterminated template literal", severity: "error", source: "brackets" });
  } else if (state === "blockComment") {
    push({ line: 1, col: 1, message: "Unclosed block comment (/*)", severity: "error", source: "brackets" });
  }
  for (const left of stack) {
    const p = loc(left.offset);
    push({
      line: p.line,
      col: p.col,
      message: `Unclosed "${left.ch}" — expected "${PAIRS[left.ch]}"`,
      severity: "error",
      source: "brackets",
    });
  }
  return { pairs, diagnostics };
}

const HASH_COMMENT_EXTS = new Set([
  "sh", "bash", "zsh", "fish", "py", "pyw", "rb", "pl", "pm", "r",
  "yaml", "yml", "toml", "ini", "cfg", "properties", "jl", "nim",
  "dockerfile", "mk", "makefile", "gradle",
]);

function usesHashComments(fileName?: string): boolean {
  if (!fileName) return false;
  const base = fileName.split("/").pop() || fileName;
  if (/^(Dockerfile|Makefile|makefile)$/.test(base)) return true;
  return HASH_COMMENT_EXTS.has(extOf(fileName));
}

let tsModule: any = null;
let tsTried = false;

function getTs(): any | null {
  if (tsTried) return tsModule;
  tsTried = true;
  try {
    // Lazy so startup never pays for the compiler; guarded so the editor
    // always works even if the bundle lacks it (falls back to bracket scan).
    tsModule = require("typescript");
  } catch (_) {
    tsModule = null;
  }
  return tsModule;
}

function analyzeTsFamily(content: string, fileName: string, ext: string): CodeDiagnostic[] | null {
  const ts = getTs();
  // Explicit shape check: Metro maps "typescript" to an empty shim (see
  // metro.config.js), so require() succeeds but yields {}. Same fallback.
  if (!ts || typeof ts.transpileModule !== "function") return null;
  try {
    const isJsx = ext === "tsx" || ext === "jsx";
    const scriptKind = ext === "tsx" ? ts.ScriptKind.TSX : ext === "jsx" ? ts.ScriptKind.JSX
      : ext === "ts" || ext === "mts" || ext === "cts" ? ts.ScriptKind.TS
      : ts.ScriptKind.JS;
    const res = ts.transpileModule(content, {
      compilerOptions: {
        ...(isJsx ? { jsx: ts.JsxEmit.Preserve } : {}),
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        allowJs: true,
      },
      fileName,
      reportDiagnostics: true,
    });
    const out: CodeDiagnostic[] = [];
    const diags = res.diagnostics || [];
    for (const d of diags) {
      if (d.category !== ts.DiagnosticCategory.Error) continue;
      if (d.file && typeof d.start === "number") {
        const lc = ts.getLineAndCharacterOfPosition(d.file, d.start);
        const len = typeof d.length === "number" ? d.length : 1;
        const endLc = ts.getLineAndCharacterOfPosition(d.file, d.start + len);
        out.push({
          line: lc.line + 1,
          col: lc.character + 1,
          endLine: endLc.line + 1,
          endCol: endLc.character + 1,
          message: cleanTsMessage(ts.flattenDiagnosticMessageText(d.messageText, " ")),
          severity: "error",
          source: "ts",
        });
      } else {
        out.push({
          line: 1,
          col: 1,
          message: cleanTsMessage(ts.flattenDiagnosticMessageText(d.messageText, " ")),
          severity: "error",
          source: "ts",
        });
      }
      if (out.length >= MAX_DIAGNOSTICS) break;
    }
    return out;
  } catch (_) {
    return null;
  }
}

function cleanTsMessage(msg: string): string {
  return msg.replace(/\s+/g, " ").trim().slice(0, 220);
}

function analyzeJson(content: string): CodeDiagnostic[] {
  try {
    JSON.parse(content);
    return [];
  } catch (e: any) {
    const msg = String(e?.message || "Invalid JSON");
    const m = msg.match(/position\s+(\d+)/i);
    let line = 1;
    let col = 1;
    if (m) {
      const pos = parseInt(m[1], 10);
      const starts = lineStarts(content);
      const lc = offsetToLineCol(starts, Math.min(pos, content.length));
      line = lc.line;
      col = lc.col;
    }
    return [{ line, col, message: msg.slice(0, 200), severity: "error", source: "json" }];
  }
}

function analyzePython(content: string, scan: ScanResult): CodeDiagnostic[] {
  const out: CodeDiagnostic[] = [...scan.diagnostics.map((d) => ({ ...d, source: "python" as const }))];
  const lines = content.split("\n");
  const compound = /^\s*(def|class|if|elif|else|for|while|with|try|except|finally)\b/;
  for (let idx = 0; idx < lines.length; idx++) {
    if (out.length >= MAX_DIAGNOSTICS) break;
    const line = lines[idx];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const indent = line.match(/^(\s*)/)?.[1] || "";
    if (indent.includes("\t") && indent.includes(" ")) {
      out.push({ line: idx + 1, col: 1, message: "Mixed tabs and spaces in indentation", severity: "warning", source: "python" });
    }
    const stripped = line.replace(/#.*$/, "").trimEnd();
    if (compound.test(line) && !/:\s*$/.test(stripped)) {
      // Skip multi-line signatures (unbalanced parens) to avoid false positives.
      const opens = (stripped.match(/\(/g) || []).length;
      const closes = (stripped.match(/\)/g) || []).length;
      if (opens === closes) {
        out.push({ line: idx + 1, col: line.length + 1, message: `Expected ":" at end of "${stripped.split(/\s+/)[0]}" statement`, severity: "error", source: "python" });
      }
    }
  }
  return out;
}

/**
 * Main entry: language-aware diagnostics for the whole file (capped).
 */
export function analyzeCode(content: string, fileName?: string): CodeDiagnostic[] {
  if (!content || !content.trim()) return [];
  if (content.length > MAX_ANALYZE_CHARS) return [];
  const ext = extOf(fileName);
  const name = fileName || "file.ts";

  if (ext === "json" || ext === "jsonc") return analyzeJson(content);

  const tsFamily = new Set(["ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts"]);
  if (tsFamily.has(ext)) {
    const tsDiags = analyzeTsFamily(content, name, ext);
    if (tsDiags) return tsDiags;
  }

  const mode = langModeFor(fileName);
  const scan = scanBrackets(content, mode, usesHashComments(fileName));
  if (ext === "py" || ext === "pyw") return analyzePython(content, scan);
  return scan.diagnostics;
}

/**
 * Bracket partner lookup for a cursor offset (0-based, cursor sits between chars).
 * Checks the char before the cursor first, then the char at the cursor.
 */
export function findMatchingBracket(content: string, cursorOffset: number, fileName?: string): BracketMatch {
  if (!content || content.length > MAX_ANALYZE_CHARS) return { kind: "none" };
  const before = cursorOffset > 0 ? content[cursorOffset - 1] : "";
  const at = cursorOffset < content.length ? content[cursorOffset] : "";
  let target = -1;
  if (before && (OPENERS.has(before) || CLOSERS.has(before))) target = cursorOffset - 1;
  else if (at && (OPENERS.has(at) || CLOSERS.has(at))) target = cursorOffset;
  if (target < 0) return { kind: "none" };

  const mode = langModeFor(fileName);
  const scan = scanBrackets(content, mode, usesHashComments(fileName));
  for (const p of scan.pairs) {
    if (p.open === target || p.close === target) {
      const starts = lineStarts(content);
      const o = offsetToLineCol(starts, p.open);
      const c = offsetToLineCol(starts, p.close);
      return { kind: "pair", openLine: o.line, openCol: o.col, closeLine: c.line, closeCol: c.col };
    }
  }
  const starts = lineStarts(content);
  const lc = offsetToLineCol(starts, target);
  return { kind: "unmatched", line: lc.line, col: lc.col };
}

/** Earliest error line (1-based) or 0 when clean. */
export function firstErrorLine(diags: CodeDiagnostic[]): number {
  let min = 0;
  for (const d of diags) {
    if (d.severity !== "error") continue;
    if (min === 0 || d.line < min) min = d.line;
  }
  return min;
}
