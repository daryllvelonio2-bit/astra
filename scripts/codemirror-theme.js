// CodeMirror theme builders for the Astra editor WebView.
// Extracted from codemirror-entry.js (agents.md 500-line limit) — pure
// extension builders, no state. Imported by the esbuild bundle.
import { EditorView } from "@codemirror/view";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";

export function createFontTheme(fontSize, lineHeight) {
  const fs = fontSize || 14;
  const lh = lineHeight ? `${lineHeight}px` : `${Math.round(fs * 1.45)}px`;
  return EditorView.theme({
    "&": {
      fontSize: `${fs}px`,
    },
    ".cm-content": {
      fontFamily: 'ui-monospace, "SF Mono", "Roboto Mono", "JetBrains Mono", Menlo, Consolas, monospace',
      lineHeight: lh,
    },
    ".cm-line": {
      lineHeight: lh,
    },
    ".cm-gutters": {
      fontFamily: 'ui-monospace, "SF Mono", "Roboto Mono", "JetBrains Mono", Menlo, Consolas, monospace',
      fontSize: `${Math.max(9, fs - 2)}px`,
      lineHeight: lh,
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 4px 0 2px",
      minWidth: "16px",
    },
    ".cm-foldGutter": {
      width: "0px",
    },
    ".cm-foldGutter .cm-gutterElement": {
      position: "relative",
      left: "-22px",
      width: "22px",
      textAlign: "center",
    },
    ".cm-foldMarker": {
      display: "block",
      width: "100%",
      height: "100%",
      backgroundColor: "var(--gutter-bg)",
      cursor: "pointer",
    },
    ".cm-gutterElement": {
      lineHeight: lh,
    },
  });
}

// ---------------------------------------------------------------------------
// Build a fully dynamic CodeMirror theme from the RN theme object.
// themeObj shape:
//   { isDark, bgPrimary, bgSecondary, textPrimary, textMuted, accent,
//     accentCyan, accentPurple, accentGold, accentGreen, accentRed,
//     tokens: { keyword, comment, string, number, type, function, operator,
//               jsx_tag, property, boolean, plain } }
// ---------------------------------------------------------------------------
export function buildEditorTheme(themeObj) {
  const isDark = !!themeObj.isDark;
  const bg = themeObj.bgPrimary || (isDark ? "#131314" : "#ffffff");
  const bgSecondary = themeObj.bgSecondary || (isDark ? "#16171b" : "#f6f8fa");
  const textPrimary = themeObj.textPrimary || (isDark ? "#f1f3f4" : "#24292e");
  const textMuted = themeObj.textMuted || (isDark ? "#6b7280" : "#6e7781");
  const accent = themeObj.accent || (isDark ? "#8ab4f8" : "#2563eb");

  // Cursor color: use accent for dark, a strong blue for light
  const cursorColor = accent;
  // Selection background
  const selBg = isDark ? "rgba(138, 180, 248, 0.2)" : "rgba(37, 99, 235, 0.15)";
  // Active line
  const activeLineBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";
  const activeLineGutterBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  // Gutter border
  const gutterBorder = isDark ? "1px solid #282c35" : "1px solid #d0d7de";
  // Find/replace panel surface (top-anchored, above the keyboard line)
  const panelBorder = isDark ? "1px solid #282c35" : "1px solid #d0d7de";
  const fieldBg = isDark ? "#1e2027" : "#ffffff";
  const fieldBorder = isDark ? "#3a3f4b" : "#c8ccd2";

  const editorTheme = EditorView.theme(
    {
      "&": {
        backgroundColor: bg,
        color: textPrimary,
      },
      ".cm-content": {
        caretColor: cursorColor,
      },
      "&.cm-focused .cm-cursor": {
        borderLeftColor: cursorColor,
      },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
        backgroundColor: selBg,
      },
      ".cm-gutters": {
        backgroundColor: bgSecondary,
        color: textMuted,
        borderRight: gutterBorder,
      },
      ".cm-activeLine": {
        backgroundColor: activeLineBg,
      },
      ".cm-activeLineGutter": {
        backgroundColor: activeLineGutterBg,
        color: textPrimary,
      },
      // Search panel — minimal chrome: just the input, no panel background
      // or borders, so it costs almost no vertical space.
      ".cm-panels": {
        backgroundColor: "transparent",
        color: textPrimary,
      },
      ".cm-panel.cm-search": {
        position: "absolute",
        top: "2px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 50,
        padding: "0",
        backgroundColor: "transparent",
        border: "none",
        boxShadow: "none",
        fontFamily: 'ui-monospace, "SF Mono", "Roboto Mono", Menlo, monospace',
        fontSize: "13px",
      },
      ".cm-panel.cm-search input": {
        padding: "5px 7px",
        borderRadius: "5px",
        border: `1px solid ${fieldBorder}`,
        backgroundColor: fieldBg,
        color: textPrimary,
        outline: "none",
        minWidth: "120px",
      },
      ".cm-panel.cm-search input:focus": {
        borderColor: accent,
      },
      // Search panel — input only: every button (next/prev/all/replace/close)
      // and option checkbox (case/regex/word) is hidden. Navigation is via
      // Enter (next) / Shift+Enter (previous) inside the input.
      ".cm-panel.cm-search button": {
        display: "none",
      },
      ".cm-panel.cm-search label": {
        display: "none",
      },
    },
    { dark: isDark }
  );

  // Token colors from themeObj.tokens, with sensible fallbacks
  const tok = themeObj.tokens || {};
  const kwColor    = tok.keyword  || (isDark ? "#c678dd" : "#a626a4");
  const cmtColor   = tok.comment  || (isDark ? "#7f848e" : "#a0a1a7");
  const strColor   = tok.string   || (isDark ? "#98c379" : "#50a14f");
  const numColor   = tok.number   || (isDark ? "#d19a66" : "#986801");
  const typeColor  = tok.type     || tok.jsx_tag || (isDark ? "#e5c07b" : "#b76b01");
  const fnColor    = tok.function || (isDark ? "#61afef" : "#4078f2");
  const opColor    = tok.operator || (isDark ? "#56b6c2" : "#0184bc");
  const propColor  = tok.property || (isDark ? "#e5c07b" : "#b76b01");
  const tagColor   = tok.jsx_tag  || tok.type || (isDark ? "#e06c75" : "#e45649");
  const boolColor  = tok.boolean  || numColor;
  const regexpColor = tok.regexp  || strColor;
  const plainColor = tok.plain    || textPrimary;

  const highlightExt = syntaxHighlighting(
    HighlightStyle.define([
      // Keywords
      { tag: tags.keyword,            color: kwColor, fontWeight: "bold" },
      { tag: tags.controlKeyword,     color: kwColor, fontWeight: "bold" },
      { tag: tags.moduleKeyword,      color: kwColor, fontWeight: "bold" },
      { tag: tags.operatorKeyword,    color: opColor },
      { tag: tags.definitionKeyword,  color: kwColor, fontWeight: "bold" },
      // Comments
      { tag: tags.comment,            color: cmtColor, fontStyle: "italic" },
      { tag: tags.lineComment,        color: cmtColor, fontStyle: "italic" },
      { tag: tags.blockComment,       color: cmtColor, fontStyle: "italic" },
      { tag: tags.docComment,         color: cmtColor, fontStyle: "italic" },
      // Strings & literals
      { tag: tags.string,             color: strColor },
      { tag: tags.docString,          color: strColor },
      { tag: tags.character,          color: strColor },
      { tag: tags.attributeValue,     color: strColor },
      { tag: tags.regexp,             color: regexpColor },
      // Numbers & booleans
      { tag: tags.number,             color: numColor },
      { tag: tags.integer,            color: numColor },
      { tag: tags.float,              color: numColor },
      { tag: tags.bool,               color: boolColor },
      { tag: tags.atom,               color: boolColor },
      { tag: tags.null,               color: boolColor },
      // Types & class names
      { tag: tags.typeName,           color: typeColor },
      { tag: tags.className,          color: typeColor },
      { tag: tags.definition(tags.typeName), color: typeColor },
      // Functions
      { tag: tags.function(tags.name),         color: fnColor },
      { tag: tags.function(tags.variableName), color: fnColor },
      { tag: tags.function(tags.propertyName), color: fnColor },
      { tag: tags.function(tags.definition(tags.variableName)), color: fnColor },
      // Properties & names
      { tag: tags.propertyName,       color: propColor },
      { tag: tags.attributeName,      color: propColor },
      { tag: tags.labelName,          color: propColor },
      // Tags (HTML/JSX)
      { tag: tags.tagName,            color: tagColor },
      // Operators & punctuation
      { tag: tags.operator,           color: opColor },
      { tag: tags.arithmeticOperator, color: opColor },
      { tag: tags.bitwiseOperator,    color: opColor },
      { tag: tags.compareOperator,    color: opColor },
      { tag: tags.logicOperator,      color: opColor },
      { tag: tags.updateOperator,     color: opColor },
      { tag: tags.punctuation,        color: plainColor },
      { tag: tags.separator,          color: plainColor },
      { tag: tags.bracket,            color: plainColor },
      // Misc
      { tag: tags.url,                color: strColor },
      { tag: tags.escape,             color: strColor },
      { tag: tags.color,              color: strColor },
      { tag: tags.invalid,             color: isDark ? "#ff5555" : "#cc0000", textDecoration: "underline" },
      { tag: tags.self,               color: kwColor },
      { tag: tags.namespace,          color: typeColor },
      { tag: tags.macroName,          color: fnColor },
      // Fallback: variableName and name get plain text color
      { tag: tags.variableName,       color: plainColor },
      { tag: tags.name,               color: plainColor },
    ])
  );

  return [editorTheme, highlightExt];
}
