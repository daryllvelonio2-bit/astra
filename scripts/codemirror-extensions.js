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

// --- Keyword / builtin completion -----------------------------------------
// CodeMirror's language packages only ship completion for JS/TS and Python
// (localCompletionSource = identifiers/properties), and even those omit
// language keywords. This source fills that gap: html/css/json/plain get
// their only completion from here, and JS/TS/Python get keywords too.
// The active list is switched by setCompletionLanguage() from the entry, the
// same place the language compartment is reconfigured.
const JS_KEYWORDS = [
  "const", "let", "var", "function", "return", "if", "else", "for", "while", "do",
  "switch", "case", "break", "continue", "class", "extends", "super", "new", "this",
  "import", "from", "export", "default", "async", "await", "try", "catch", "finally",
  "throw", "typeof", "instanceof", "delete", "in", "of", "yield", "static", "get", "set",
  "interface", "type", "enum", "implements", "public", "private", "protected", "readonly",
  "console", "globalThis", "document", "window", "Math", "JSON", "Object", "Array",
  "String", "Number", "Boolean", "Promise", "Map", "Set", "Date", "RegExp",
  "null", "undefined", "true", "false",
];
const PY_KEYWORDS = [
  "def", "return", "if", "elif", "else", "for", "while", "class", "import", "from",
  "as", "try", "except", "finally", "with", "lambda", "yield", "global", "nonlocal",
  "pass", "break", "continue", "raise", "assert", "del", "in", "is", "not", "and", "or",
  "None", "True", "False", "self", "async", "await", "print", "len", "range", "str",
  "int", "float", "list", "dict", "set", "tuple", "isinstance",
];
const HTML_KEYWORDS = [
  "html", "head", "body", "div", "span", "p", "a", "img", "ul", "ol", "li", "table",
  "tr", "td", "th", "thead", "tbody", "h1", "h2", "h3", "h4", "h5", "h6", "form",
  "input", "button", "label", "select", "option", "textarea", "script", "style", "link",
  "meta", "title", "header", "footer", "nav", "section", "article", "main", "aside",
  "video", "audio", "canvas", "svg", "br", "hr", "strong", "em", "code", "pre",
  "class", "id", "href", "src", "alt", "type", "value", "placeholder", "name",
];
const CSS_KEYWORDS = [
  "display", "flex", "grid", "block", "inline", "none", "position", "absolute", "relative",
  "fixed", "sticky", "top", "right", "bottom", "left", "width", "height", "min-width",
  "max-width", "min-height", "max-height", "margin", "padding", "border", "border-radius",
  "background", "background-color", "color", "font-size", "font-weight", "font-family",
  "line-height", "text-align", "text-decoration", "z-index", "overflow", "opacity",
  "transform", "transition", "animation", "cursor", "box-shadow", "outline", "gap",
  "align-items", "justify-content", "flex-direction", "flex-wrap", "center", "column", "row",
];
const SHELL_KEYWORDS = [
  "if", "then", "else", "elif", "fi", "for", "while", "do", "done", "case", "esac",
  "function", "echo", "export", "cd", "ls", "cat", "grep", "sed", "awk", "source",
  "local", "return", "exit", "set", "unset", "read", "printf", "mkdir", "rm", "cp", "mv",
];
const SQL_KEYWORDS = [
  "SELECT", "FROM", "WHERE", "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE",
  "CREATE", "TABLE", "DROP", "ALTER", "JOIN", "LEFT", "RIGHT", "INNER", "OUTER", "ON",
  "GROUP", "BY", "ORDER", "HAVING", "LIMIT", "OFFSET", "AND", "OR", "NOT", "NULL",
];

const GO_KEYWORDS = [
  "package", "import", "func", "return", "if", "else", "for", "range", "switch", "case",
  "default", "break", "continue", "defer", "go", "chan", "select", "struct", "interface",
  "map", "type", "var", "const", "make", "new", "append", "len", "cap", "copy", "delete",
  "nil", "true", "false", "string", "int", "int64", "float64", "bool", "byte", "rune",
  "error", "fmt", "context", "sync", "time",
];
const RUST_KEYWORDS = [
  "fn", "let", "mut", "const", "struct", "enum", "impl", "trait", "for", "while", "loop",
  "if", "else", "match", "return", "use", "mod", "pub", "crate", "self", "super", "where",
  "async", "await", "move", "ref", "in", "as", "dyn", "unsafe", "type", "true", "false",
  "Some", "None", "Ok", "Err", "Vec", "String", "Option", "Result", "println", "format",
];
const JAVA_KEYWORDS = [
  "public", "private", "protected", "class", "interface", "extends", "implements", "static",
  "final", "void", "int", "long", "double", "float", "boolean", "char", "String", "new",
  "return", "if", "else", "for", "while", "do", "switch", "case", "default", "break",
  "continue", "try", "catch", "finally", "throw", "throws", "import", "package", "this",
  "super", "null", "true", "false", "abstract", "synchronized", "System",
];
const KOTLIN_KEYWORDS = [
  "fun", "val", "var", "class", "object", "interface", "data", "sealed", "enum", "when",
  "if", "else", "for", "while", "do", "return", "try", "catch", "finally", "throw",
  "import", "package", "this", "super", "null", "true", "false", "is", "in", "as", "by",
  "lateinit", "override", "open", "private", "public", "protected", "internal", "companion",
  "suspend", "println", "listOf", "mapOf",
];
const C_KEYWORDS = [
  "int", "char", "float", "double", "void", "long", "short", "unsigned", "signed", "const",
  "static", "struct", "union", "enum", "typedef", "if", "else", "for", "while", "do",
  "switch", "case", "default", "break", "continue", "return", "sizeof", "include", "define",
  "malloc", "free", "printf", "NULL",
];
const CPP_KEYWORDS = [
  ...C_KEYWORDS, "class", "public", "private", "protected", "virtual", "override", "template",
  "typename", "namespace", "using", "new", "delete", "nullptr", "true", "false", "std",
  "vector", "string", "auto", "constexpr", "cout", "cin", "endl",
];
const RUBY_KEYWORDS = [
  "def", "end", "if", "elsif", "else", "unless", "while", "until", "for", "do", "case",
  "when", "return", "yield", "class", "module", "self", "nil", "true", "false", "require",
  "puts", "attr_accessor", "begin", "rescue", "ensure", "new", "each", "map", "select",
];
const LUA_KEYWORDS = [
  "function", "end", "if", "then", "elseif", "else", "for", "while", "do", "repeat",
  "until", "return", "local", "nil", "true", "false", "and", "or", "not", "print", "pairs",
  "ipairs", "table", "string", "math", "io",
];
const PHP_KEYWORDS = [
  "function", "class", "public", "private", "protected", "static", "echo", "if", "else",
  "elseif", "for", "foreach", "while", "return", "new", "null", "true", "false", "array",
  "isset", "empty", "require", "include", "namespace", "use", "const", "var",
];

const KEYWORDS = {
  js: JS_KEYWORDS,
  ts: JS_KEYWORDS,
  jsx: JS_KEYWORDS,
  tsx: JS_KEYWORDS,
  mjs: JS_KEYWORDS,
  cjs: JS_KEYWORDS,
  py: PY_KEYWORDS,
  pyw: PY_KEYWORDS,
  html: HTML_KEYWORDS,
  htm: HTML_KEYWORDS,
  vue: HTML_KEYWORDS,
  svelte: HTML_KEYWORDS,
  css: CSS_KEYWORDS,
  scss: CSS_KEYWORDS,
  less: CSS_KEYWORDS,
  json: ["true", "false", "null"],
  jsonc: ["true", "false", "null"],
  sh: SHELL_KEYWORDS,
  bash: SHELL_KEYWORDS,
  zsh: SHELL_KEYWORDS,
  sql: SQL_KEYWORDS,
  go: GO_KEYWORDS,
  rs: RUST_KEYWORDS,
  java: JAVA_KEYWORDS,
  kt: KOTLIN_KEYWORDS,
  kts: KOTLIN_KEYWORDS,
  c: C_KEYWORDS,
  h: C_KEYWORDS,
  cpp: CPP_KEYWORDS,
  cc: CPP_KEYWORDS,
  cxx: CPP_KEYWORDS,
  hpp: CPP_KEYWORDS,
  rb: RUBY_KEYWORDS,
  lua: LUA_KEYWORDS,
  php: PHP_KEYWORDS,
  yaml: ["true", "false", "null", "yes", "no"],
  yml: ["true", "false", "null", "yes", "no"],
};

let activeKeywords = [];

/** Switches the keyword set to match the active file's language. */
export function setCompletionLanguage(fileName) {
  const name = String(fileName || "");
  const ext = (name.includes(".") ? name.split(".").pop() : name).toLowerCase();
  activeKeywords = KEYWORDS[ext] || [];
}

const PREFIX_RE = /[A-Za-z_$][\w$]*$/;

function keywordCompletions(context) {
  if (activeKeywords.length === 0) return null;
  const before = context.matchBefore(PREFIX_RE);
  if (!before || before.from === before.to) return null;

  const lower = before.text.toLowerCase();
  const options = [];
  for (const kw of activeKeywords) {
    const kwl = kw.toLowerCase();
    if (kwl === lower) continue;
    if (kwl.startsWith(lower)) {
      options.push({ label: kw, type: "keyword" });
      if (options.length >= MAX_COMPLETIONS) break;
    }
  }

  if (options.length === 0) return null;
  return { from: before.from, options, validFor: PREFIX_RE };
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
    {
      autocomplete: [
        snippetCompletions,
        keywordCompletions,
        documentWordCompletions,
      ],
    },
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
