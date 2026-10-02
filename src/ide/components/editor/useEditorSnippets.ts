import { useEffect } from "react";
import { getInstalledSnippets } from "../../services/extensions/extensionRegistry";

// Per-extension payload cache: getInstalledSnippets reads one JSON file per
// installed snippet pack from disk, so we only do it once per language per
// app session (registry changes are rare and the payload is small).
const payloadCache: Record<string, string> = {};

/**
 * Pushes marketplace (Open VSX) snippets for the active file's language into
 * the CodeMirror engine via `window.__cmSetSnippets`. Without this, installed
 * snippet packs were extracted but never surfaced in autocomplete.
 *
 * Runs when the WebView becomes ready and whenever the file changes, so a
 * remount (tab switch, workspace switch) re-seeds the engine.
 */
export function useEditorSnippets(
  fileName: string | undefined,
  isReady: boolean,
  inject: (js: string) => void
): void {
  useEffect(() => {
    if (!isReady) return;
    let cancelled = false;

    const ext = (fileName || "").split(".").pop()?.toLowerCase() || "";
    const push = (payload: string) => {
      if (cancelled) return;
      inject(`window.__cmSetSnippets && window.__cmSetSnippets(${JSON.stringify(payload)})`);
    };

    const cached = payloadCache[ext];
    if (cached !== undefined) {
      push(cached);
      return;
    }

    getInstalledSnippets(ext)
      .then((list) => {
        const payload = JSON.stringify(
          list.map((s) => ({
            prefix: s.prefix,
            body: s.body,
            description: s.description,
          }))
        );
        payloadCache[ext] = payload;
        push(payload);
      })
      .catch(() => push("[]"));

    return () => {
      cancelled = true;
    };
  }, [fileName, isReady, inject]);
}
