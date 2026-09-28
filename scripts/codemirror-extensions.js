// ENGINE add-ons for the Astra editor: comment toggle, line wrapping,
// bracket matching, auto-closing brackets, and a lightweight document-word
// autocomplete. Imported by codemirror-entry.js and spread into the
// EditorView extensions via `engineExtensions` (one import + one spread).
// Export names verified against node_modules:
//   @codemirror/commands     -> toggleComment
//   @codemirror/language     -> bracketMatching
//   @codemirror/autocomplete -> closeBrackets, autocompletion
//   @codemirror/view         -> EditorView.lineWrapping (static)

import { toggleComment } from "@codemirror/commands";
import { keymap, EditorView } from "@codemirror/view";
import { bracketMatching } from "@codemirror/language";
import { autocompletion, closeBrackets } from "@codemirror/autocomplete";

// --- Document-word completion source (kept cheap for the keystroke path) ---
// Triggered only when the text before the cursor ends in >= 2 word chars.
// Scans the document once per query, lowercases for dedupe, returns at most
// 20 options. A validFor cap lets CM reuse the result on further keystrokes
// without re-querying the source.
const MAX_COMPLETIONS = 20;
const WORD_BEFORE_RE = /\w{2,}$/;

function documentWordCompletions(context) {
  const before = context.matchBefore(WORD_BEFORE_RE);
  if (!before || before.from === before.to) return null;

  const prefix = context.state.doc.sliceString(before.from, before.to);
  const lowerPrefix = prefix.toLowerCase();

  const text = context.state.doc.toString();
  const seen = new Set([lowerPrefix]);
  const options = [];

  // Single pass with a manual word scan: no full doc.split allocation.
  const wordRe = /\w+/g;
  let m;
  while ((m = wordRe.exec(text)) !== null) {
    const lower = m[0].toLowerCase();
    if (lower.length < 3 || lower === lowerPrefix || seen.has(lower)) continue;
    if (lower.startsWith(lowerPrefix)) {
      seen.add(lower);
      options.push({ label: m[0], type: "text" });
      if (options.length >= MAX_COMPLETIONS) break;
    }
  }

  if (options.length === 0) return null;
  return {
    from: before.from,
    options,
    // Result list only contains plain word labels, so a regex validFor is
    // safe and lets CM update synchronously while the user keeps typing.
    validFor: /^\w{2,}$/,
  };
}

export const engineExtensions = [
  // Comment toggle on Mod-/; also exposed via window.__cmToggleComment.
  keymap.of([{ key: "Mod-/", run: toggleComment }]),
  EditorView.lineWrapping,
  bracketMatching(),
  closeBrackets(),
  autocompletion({
    override: [documentWordCompletions],
    icons: false,
    activateOnTyping: true,
    maxRenderedOptions: MAX_COMPLETIONS,
  }),
];

// Wrapper used by the entry's window.__cmToggleComment expose (keeps the
// entry slim); try/catch here covers both the command and the refocus.
export function runToggleComment(cmView) {
  try {
    toggleComment(cmView);
    if (cmView) cmView.focus();
  } catch (_) {}
}
