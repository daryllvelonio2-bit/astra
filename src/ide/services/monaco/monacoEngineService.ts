import type { TokenizedLine } from "../syntaxTokenizer";
import { monacoLangForFile, monacoScopeToTokenType } from "./monacoLanguageMap";

/**
 * Bridge to the hidden headless Monaco WebView (tokenize only).
 * Singleton: MonacoEngineHost attaches the WebView ref + forwards
 * onMessage here; callers use requestMonacoTokens() and never touch
 * the WebView. All failures resolve null -> caller falls back to regex.
 */

type WebViewRef = { injectJavaScript: (js: string) => void } | null;

interface Pending {
  resolve: (v: Array<Array<[number, string]>> | null) => void;
  timer: ReturnType<typeof setTimeout>;
}

const MAX_CODE_CHARS = 400_000;
const REQUEST_TIMEOUT_MS = 8000;
// Cap in-flight engine round-trips: rapid file switches could otherwise pile
// up pendings (each with an 8s timer). Oldest surplus resolves null so the
// caller falls back to regex; the newest request always runs.
const MAX_PENDING = 3;

let ref: WebViewRef = null;
let ready = false;
const readyListeners = new Set<() => void>();
let nextId = 1;
const pending = new Map<string, Pending>();

export function attachMonacoEngine(r: WebViewRef): void {
  ref = r;
}

export function detachMonacoEngine(): void {
  ref = null;
  ready = false;
  pending.forEach((p) => {
    clearTimeout(p.timer);
    p.resolve(null);
  });
  pending.clear();
}

export function isMonacoEngineReady(): boolean {
  return ready && ref !== null;
}

export function onMonacoEngineReady(fn: () => void): () => void {
  readyListeners.add(fn);
  if (ready) fn();
  return () => readyListeners.delete(fn);
}

/** Called by MonacoEngineHost.onMessage with the raw WebView payload. */
export function handleMonacoEngineMessage(raw: string): boolean {
  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    return false;
  }
  if (!msg || typeof msg.type !== "string") return false;
  if (msg.type === "monaco-ready") {
    ready = !!msg.hasEngine && ref !== null;
    if (ready) readyListeners.forEach((fn) => { try { fn(); } catch {} });
    return true;
  }
  if (msg.type === "monaco-tokens" && typeof msg.id === "string") {
    const p = pending.get(msg.id);
    if (!p) return true;
    pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.error || !Array.isArray(msg.lines)) p.resolve(null);
    else p.resolve(msg.lines as Array<Array<[number, string]>>);
    return true;
  }
  return false;
}

export function requestMonacoEnginePing(): void {
  try {
    ref?.injectJavaScript("window.__monacoPing && window.__monacoPing();true;");
  } catch {}
}

/** Raw offset+scope lines from the engine, or null on any failure. */
export function requestMonacoTokens(
  code: string,
  fileName?: string
): Promise<Array<Array<[number, string]>> | null> {
  if (!isMonacoEngineReady() || !code) return Promise.resolve(null);
  const lang = monacoLangForFile(fileName);
  if (lang === "plaintext") return Promise.resolve(null);
  const src = code.length > MAX_CODE_CHARS ? code.slice(0, MAX_CODE_CHARS) : code;
  const id = `m${nextId++}`;
  return new Promise((resolve) => {
    while (pending.size >= MAX_PENDING) {
      const oldest = pending.keys().next();
      if (oldest.done) break;
      const p = pending.get(oldest.value);
      pending.delete(oldest.value);
      if (p) {
        clearTimeout(p.timer);
        p.resolve(null);
      }
    }
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve(null);
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    try {
      const js =
        "window.__monacoTokens(" +
        JSON.stringify(id) +
        "," +
        JSON.stringify(src) +
        "," +
        JSON.stringify(lang) +
        ");true;";
      ref?.injectJavaScript(js);
    } catch {
      pending.delete(id);
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/** Maps engine offset+scope lines to the native TokenizedLine shape. */
export function mapMonacoLines(
  code: string,
  raw: Array<Array<[number, string]>>,
  startLineNumber = 1
): TokenizedLine[] {
  const srcLines = code.split("\n");
  return srcLines.map((lineText, i) => {
    const indentMatch = lineText.match(/^(\s+)/);
    const toks = raw[i] ?? [];
    if (!toks.length) {
      return {
        lineNumber: startLineNumber + i,
        tokens: [{ text: lineText || "", type: "plain" as const }],
        indentWidth: indentMatch ? indentMatch[1].length : 0,
      };
    }
    const tokens: TokenizedLine["tokens"] = [];
    for (let k = 0; k < toks.length && tokens.length < 250; k++) {
      const [start, scope] = toks[k];
      const end = k + 1 < toks.length ? toks[k + 1][0] : lineText.length;
      const text = lineText.slice(Math.max(0, start), Math.max(start, end));
      if (!text) continue;
      tokens.push({ text, type: monacoScopeToTokenType(scope) });
    }
    return {
      lineNumber: startLineNumber + i,
      tokens: tokens.length ? tokens : [{ text: lineText, type: "plain" as const }],
      indentWidth: indentMatch ? indentMatch[1].length : 0,
    };
  });
}
