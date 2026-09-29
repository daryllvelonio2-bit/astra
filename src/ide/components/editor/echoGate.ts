// Anti-echo gate for the CodeMirror WebView (extracted from
// CodeMirrorEditorView.tsx to keep both files under the 500-line budget).
//
// Phase 1 anti-echo: CodeMirror is source-of-truth while typing. React
// renders lag behind WebView postMessage bursts ("a" -> "ab"), so an
// intermediate render must never be injected back (it would clobber newer
// keystrokes and reset the cursor). Only file switches and true external
// edits (format / disk reload) may push content into the WebView.

export const ECHO_HISTORY_MAX = 30;
export const ECHO_HISTORY_TTL_MS = 3000;

function hashText(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return ((h * 33) ^ s.length) | 0;
}

export interface EchoGate {
  /** Record a text emitted by the WebView (typing / programmatic dispatch). */
  rememberEmitted(text: string): void;
  /** True when `text` is a stale intermediate render, not an external edit. */
  isStaleEcho(text: string): boolean;
  /** Drop all history (file switch / external edit adoption). */
  clear(): void;
}

export function createEchoGate(): EchoGate {
  // Recent typing emissions (hash + timestamp). A content prop whose hash is
  // in here is a stale intermediate echo, not an external edit.
  const hashes = new Set<number>();
  const queue: Array<{ h: number; t: number }> = [];

  const prune = () => {
    const cutoff = Date.now() - ECHO_HISTORY_TTL_MS;
    while (queue.length > 0 && (queue[0].t < cutoff || queue.length > ECHO_HISTORY_MAX)) {
      const old = queue.shift();
      if (old && !queue.some((e) => e.h === old.h)) hashes.delete(old.h);
    }
  };

  return {
    rememberEmitted(text: string) {
      const h = hashText(text || "");
      const now = Date.now();
      if (!hashes.has(h)) {
        hashes.add(h);
        queue.push({ h, t: now });
      } else {
        // Refresh timestamp so live undo/redo back-and-forth stays recognized.
        for (let i = 0; i < queue.length; i++) {
          if (queue[i].h === h) {
            queue[i].t = now;
            break;
          }
        }
      }
      // Prune by TTL and cap: keeps disk-reload-after-pause from
      // false-matching an old typing state.
      prune();
    },
    isStaleEcho(text: string): boolean {
      prune();
      return hashes.has(hashText(text || ""));
    },
    clear() {
      hashes.clear();
      queue.length = 0;
    },
  };
}
