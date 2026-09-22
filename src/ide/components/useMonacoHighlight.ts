import { useEffect, useRef, useState } from "react";
import type { TokenizedLine } from "../services/syntaxTokenizer";
import {
  isMonacoEngineReady,
  mapMonacoLines,
  onMonacoEngineReady,
  requestMonacoTokens,
} from "../services/monaco/monacoEngineService";

/**
 * Phase 4 + 5: debounced Monaco correction over the sync regex first paint.
 * Returns corrected TokenizedLine[] once the hidden engine answers, or
 * null while pending / on any failure (caller keeps regex output).
 * Stale-id discard: a newer chunk/file always wins, late replies dropped.
 *
 * Phase 5 opts: LRU cache (scroll-back is instant, no engine round-trip)
 * + stale-while-revalidate while typing in the same window (no regex
 * flash per keystroke). Stale lines are only kept when line numbers still
 * match (same file + same window start); scroll/file switch clears.
 */
const CORRECT_DEBOUNCE_MS = 800;
const CACHE_CAP = 30;

function hashChunk(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

// Cheap paint signature: identical type+length shape repaints nothing
// visible, so skip the setState and avoid churning hundreds of <Text>.
function paintSignature(lines: TokenizedLine[]): string {
  let s = lines.length + ":";
  for (const l of lines) {
    s += l.tokens.length + ",";
    for (const t of l.tokens) s += t.type + t.text.length + ",";
    s += ";";
  }
  return s;
}

export function useMonacoHighlight(
  code: string,
  fileName?: string,
  startLineNumber = 1
): TokenizedLine[] | null {
  const [corrected, setCorrected] = useState<TokenizedLine[] | null>(null);
  const reqIdRef = useRef(0);
  const cacheRef = useRef(new Map<string, TokenizedLine[]>());
  const windowRef = useRef("");
  const appliedSigRef = useRef("");

  useEffect(() => {
    const windowKey = `${fileName ?? ""}::${startLineNumber}`;
    const key = `${windowKey}::${code.length}::${hashChunk(code)}`;
    const cache = cacheRef.current;
    const hit = cache.get(key);
    if (hit) {
      // LRU refresh + instant paint, no engine round-trip.
      cache.delete(key);
      cache.set(key, hit);
      windowRef.current = windowKey;
      appliedSigRef.current = paintSignature(hit);
      setCorrected(hit);
      return;
    }
    // When code changed and is not in cache, clear stale correction immediately
    // so tokenizedLines synchronously renders newly typed characters with zero lag.
    windowRef.current = windowKey;
    appliedSigRef.current = "";
    setCorrected(null);
    // Empty chunk (deleted everything): nothing to correct, drop any stale
    // paint so deleted lines can't resurrect from the previous correction.
    if (!code) {
      appliedSigRef.current = "";
      setCorrected(null);
      return;
    }
    let cancelled = false;
    const id = ++reqIdRef.current;
    let unsubReady: (() => void) | null = null;

    const fire = async (myId: number) => {
      let raw: Array<Array<[number, string]>> | null = null;
      try {
        raw = await requestMonacoTokens(code, fileName);
      } catch {
        raw = null;
      }
      if (cancelled || myId !== reqIdRef.current) return; // stale: drop
      if (!raw) {
        // Engine failed/timed out/unsupported for THIS chunk: drop any stale
        // paint so the fresh regex render (which matches the real text)
        // shows. Keeping stale would resurrect deleted lines, and in edit
        // mode stale children re-rendered into the TextInput can even undo
        // the delete natively.
        appliedSigRef.current = "";
        setCorrected(null);
        return;
      }
      try {
        const lines = mapMonacoLines(code, raw, startLineNumber);
        if (cancelled || myId !== reqIdRef.current) return;
        cache.set(key, lines);
        if (cache.size > CACHE_CAP) {
          const oldest = cache.keys().next();
          if (!oldest.done) cache.delete(oldest.value);
        }
        // No visible change vs current paint -> skip, prevents a flash
        // caused purely by swapping identical-shape token arrays.
        const sig = paintSignature(lines);
        if (sig === appliedSigRef.current) return;
        appliedSigRef.current = sig;
        setCorrected(lines);
      } catch {
        // Malformed engine payload for this chunk: same as failure above,
        // fall back to fresh regex, never keep stale, never blank.
        if (cancelled || myId !== reqIdRef.current) return;
        appliedSigRef.current = "";
        setCorrected(null);
      }
    };

    const timer = setTimeout(() => {
      if (cancelled) return;
      if (isMonacoEngineReady()) {
        void fire(id);
      } else {
        // Engine still warming: run once it signals ready (or next edit).
        unsubReady = onMonacoEngineReady(() => {
          if (cancelled) return;
          unsubReady?.();
          unsubReady = null;
          void fire(id);
        });
      }
    }, CORRECT_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubReady?.();
    };
  }, [code, fileName, startLineNumber]);

  return corrected;
}
