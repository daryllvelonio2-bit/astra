// ENGINE add-ons for the Astra editor: comment toggle, line wrapping,
// bracket matching, auto-closing brackets, and completion sources.
// Imported by codemirror-entry.js and spread into the EditorView extensions
// via `engineExtensions` (one import + one spread).
// Export names verified against node_modules:
//   @codemirror/commands     -> toggleComment
//   @codemirror/language     -> bracketMatching
//   @codemirror/autocomplete -> closeBrackets, autocompletion,
//                               snippetCompletion, CompletionSource
//   @codemirror/state        -> EditorState.languageData facet
//   @codemirror/view         -> EditorView.lineWrapping (static)

import { toggleComment } from "@codemirror/commands";
import { keymap, EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { bracketMatching } from "@codemirror/language";
import {
  autocompletion,
  closeBrackets,
  snippetCompletion,
} from "@codemirror/autocomplete";

const MAX_COMPLETIONS = 20;
const WORD_BEFORE_RE = /\w{2,}$/;

// --- Document-word completion source (kept cheap for the keystroke path) ---
// Triggered only when the text before the cursor ends in >= 2 word chars.
// Scans the document once per query, lowercases for dedupe, returns at most
// 20 options. A validFor cap lets CM reuse the result on further keystrokes
// without re-querying the source.
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

// --- Marketplace (Open VSX) snippet completion source -----------------------
// Snippets are extracted from installed .vsix packages by the RN side and
// pushed in via window.__cmSetSnippets (JSON array of {prefix, body,
// description}). This is what makes the marketplace actually useful while
// coding: typing a snippet prefix expands the VS Code snippet body.
let installedSnippets = [];

// Sentinel for an escaped dollar while placeholders are rewritten.
const ESC_DOLLAR = "\u0000";

/**
 * Converts a VS Code snippet body into CodeMirror's `${}` placeholder syntax.
 * VS Code uses ${1:name} / $1 / $0 tab-stops; CodeMirror uses ${name} / ${}.
 * Escaped dollars (\$) become literal `$`.
 */
function toCmSnippet(raw) {
  let s = Array.isArray(raw) ? raw.join("\n") : String(raw == null ? "" : raw);
  s = s.replace(/\\\$/g, ESC_DOLLAR);
  s = s.replace(/\$\{(\d+):([^}]*)\}/g, (_m, _n, name) => "${" + name + "}");
  s = s.replace(/\$\{\d+\}/g, "${}");
  s = s.replace(/\$\d+/g, "${}");
  s = s.replace(/\u0000/g, "$");
  return s;
}

function snippetCompletions(context) {
  if (installedSnippets.length === 0) return null;
  const before = context.matchBefore(/[\w-]+$/);
  if (!before || before.from === before.to) return null;

  const word = before.text.toLowerCase();
  const options = [];
  const seen = new Set();
  for (const s of installedSnippets) {
    if (!s || !s.prefix) continue;
    const prefix = String(s.prefix);
    if (seen.has(prefix) || !prefix.toLowerCase().startsWith(word)) continue;
    seen.add(prefix);
    options.push(
      snippetCompletion(toCmSnippet(s.body), {
        label: prefix,
        detail: s.description ? String(s.description).slice(0, 32) : undefined,
        type: "keyword",
      })
    );
    if (options.length >= MAX_COMPLETIONS) break;
  }

  if (options.length === 0) return null;
  return { from: before.from, options, validFor: /^[\w-]*$/ };
}

/**
 * Installs window.__cmSetSnippets so RN can push installed marketplace
 * snippets into the engine (called from the entry, mirroring the clipboard
 * bridge). Malformed payloads clear the list rather than throwing.
 */
export function installSnippetApi() {
  if (typeof window === "undefined") return;
  window.__cmSetSnippets = function (json) {
    try {
      const parsed = typeof json === "string" ? JSON.parse(json) : json;
      installedSnippets = Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      installedSnippets = [];
    }
  };
}

export const engineExtensions = [
  // Comment toggle on Mod-/; also exposed via window.__cmToggleComment.
  keymap.of([{ key: "Mod-/", run: toggleComment }]),
  EditorView.lineWrapping,
  bracketMatching(),
  closeBrackets(),
  // NOTE: no `override` here — an override REPLACES every language-provided
  // source, which silently disabled the syntax-aware completion that
  // @codemirror/lang-javascript and lang-python ship (localCompletionSource).
  // Custom sources are added globally through the languageData facet instead,
  // so they run ALONGSIDE the language sources rather than instead of them.
  autocompletion({
    icons: false,
    activateOnTyping: true,
    maxRenderedOptions: MAX_COMPLETIONS,
  }),
  EditorState.languageData.of(() => [
    { autocomplete: [snippetCompletions, documentWordCompletions] },
  ]),
];

// Wrapper used by the entry's window.__cmToggleComment expose (keeps the
// entry slim); try/catch here covers both the command and the refocus.
export function runToggleComment(cmView) {
  try {
    toggleComment(cmView);
    if (cmView) cmView.focus();
  } catch (_) {}
}
