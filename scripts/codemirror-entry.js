import {
  EditorView,
  lineNumbers,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
} from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import {
  defaultKeymap,
  historyKeymap,
  history,
  indentWithTab,
} from "@codemirror/commands";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  HighlightStyle,
  foldKeymap,
  foldGutter,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { python } from "@codemirror/lang-python";
import { javascript } from "@codemirror/lang-javascript";
import { html as htmlLang } from "@codemirror/lang-html";
import { css as cssLang } from "@codemirror/lang-css";
import { json as jsonLang } from "@codemirror/lang-json";

(function () {
  const languageCompartment = new Compartment();
  const themeCompartment = new Compartment();
  const fontSizeCompartment = new Compartment();
  const readOnlyCompartment = new Compartment();
  const editableCompartment = new Compartment();
  const kmmCompartment = new Compartment();

  let isInternalUpdate = false;
  let currentFileName = "";
  let isKmmMode = false;
  let lastTouchTime = 0;

  const post = (msg) => {
    try {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(msg));
      }
    } catch (_) {}
  };

  function getLanguageExtension(fileName) {
    if (!fileName) return [];
    const ext = (fileName.includes(".") ? fileName.split(".").pop() : fileName).toLowerCase();
    switch (ext) {
      case "py":
      case "pyw":
        return python();
      case "js":
      case "mjs":
      case "cjs":
        return javascript();
      case "jsx":
        return javascript({ jsx: true });
      case "ts":
        return javascript({ typescript: true });
      case "tsx":
        return javascript({ jsx: true, typescript: true });
      case "html":
      case "htm":
        return htmlLang();
      case "css":
      case "scss":
      case "less":
        return cssLang();
      case "json":
      case "jsonc":
        return jsonLang();
      default:
        return [];
    }
  }

  function createFontTheme(fontSize, lineHeight) {
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
  function buildEditorTheme(themeObj) {
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
        { tag: tags.invalid,            color: isDark ? "#ff5555" : "#cc0000", textDecoration: "underline" },
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

  const initialIsDark =
    typeof window !== "undefined" && typeof window.__INITIAL_IS_DARK__ === "boolean"
      ? window.__INITIAL_IS_DARK__
      : true;

  // Build default initial theme object from __INITIAL_IS_DARK__
  const initialThemeObj = { isDark: initialIsDark };

  const minimalExtensions = [
    lineNumbers(),
    foldGutter(),
    drawSelection(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      ...foldKeymap,
      indentWithTab,
    ]),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  ];

  const startState = EditorState.create({
    doc: "",
    extensions: [
      ...minimalExtensions,
      languageCompartment.of([]),
      themeCompartment.of(buildEditorTheme(initialThemeObj)),
      fontSizeCompartment.of(createFontTheme(14, 20)),
      readOnlyCompartment.of(EditorState.readOnly.of(true)),
      editableCompartment.of(EditorView.editable.of(false)),
      kmmCompartment.of([]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !isInternalUpdate) {
          post({ type: "change", text: update.state.doc.toString() });
        }
        if (update.selectionSet) {
          const pos = update.state.selection.main.head;
          const line = update.state.doc.lineAt(pos);
          post({
            type: "cursor",
            line: line.number,
            col: pos - line.from + 1,
            totalLines: update.state.doc.lines,
          });
        }
      }),
      EditorView.domEventHandlers({
        focus: () => {
          post({ type: "focus" });
          if (isKmmMode && view && view.contentDOM) {
            view.contentDOM.setAttribute("inputmode", "none");
            view.contentDOM.setAttribute("virtualkeyboardpolicy", "manual");
          }
        },
        blur: () => {
          post({ type: "blur" });
        },
        dblclick: () => {
          post({ type: "doubleTap" });
        },
        touchstart: (e) => {
          if (e.touches && e.touches.length > 1) {
            lastTouchTime = 0;
            return;
          }
          const now = Date.now();
          if (now - lastTouchTime < 350) {
            post({ type: "doubleTap" });
          }
          lastTouchTime = now;
        },
      }),
    ],
  });

  const view = new EditorView({
    state: startState,
    parent: document.getElementById("editor"),
  });

  // Set initial CSS variable for fold gutter background
  const initialGutterBg = initialThemeObj.bgSecondary || (initialIsDark ? "#16171b" : "#f6f8fa");
  document.documentElement.style.setProperty("--gutter-bg", initialGutterBg);

  // Global APIs for React Native
  window.__cmSetContent = function (text, fileName) {
    if (typeof text !== "string") return;
    const currentText = view.state.doc.toString();
    const effects = [];

    const isNewFile = fileName && fileName !== currentFileName;
    if (isNewFile) {
      currentFileName = fileName;
      effects.push(languageCompartment.reconfigure(getLanguageExtension(fileName)));
    }

    if (text !== currentText) {
      isInternalUpdate = true;
      try {
        if (isNewFile) {
          view.dispatch({
            changes: { from: 0, to: currentText.length, insert: text },
            selection: { anchor: 0, head: 0 },
            scrollIntoView: true,
            effects,
          });
        } else {
          const curSel = view.state.selection.main;
          const newAnchor = Math.min(curSel.anchor, text.length);
          const newHead = Math.min(curSel.head, text.length);
          view.dispatch({
            changes: { from: 0, to: currentText.length, insert: text },
            selection: { anchor: newAnchor, head: newHead },
            effects,
          });
        }
      } finally {
        isInternalUpdate = false;
      }
    } else if (effects.length > 0) {
      view.dispatch({ effects });
    }

    if (isKmmMode && view.contentDOM) {
      view.contentDOM.setAttribute("inputmode", "none");
      view.contentDOM.setAttribute("virtualkeyboardpolicy", "manual");
    }
  };

  window.__cmSetFontSize = function (size, lineHeight) {
    view.dispatch({
      effects: fontSizeCompartment.reconfigure(createFontTheme(size, lineHeight)),
    });
  };

  // __cmSetTheme accepts either:
  //   (themeObj)         — new API: full theme object
  //   (isDark, bgString) — legacy two-scalar call (mid-reload backward compat)
  window.__cmSetTheme = function (themeObjOrIsDark, legacyBg) {
    let themeObj;
    if (
      typeof themeObjOrIsDark === "object" &&
      themeObjOrIsDark !== null
    ) {
      // New API: full theme object passed from RN
      themeObj = themeObjOrIsDark;
    } else if (
      typeof themeObjOrIsDark === "boolean" &&
      typeof legacyBg === "string" &&
      legacyBg.startsWith("#")
    ) {
      // Legacy two-scalar call: coerce into minimal theme object
      themeObj = { isDark: themeObjOrIsDark, bgPrimary: legacyBg };
    } else {
      // Fallback: treat first arg as isDark boolean
      themeObj = { isDark: !!themeObjOrIsDark };
    }

    view.dispatch({
      effects: themeCompartment.reconfigure(buildEditorTheme(themeObj)),
    });

    // Update CSS variable for fold gutter background
    const gutterBg = themeObj.bgSecondary || (themeObj.isDark ? "#16171b" : "#f6f8fa");
    document.documentElement.style.setProperty("--gutter-bg", gutterBg);

    // Update body background
    if (themeObj.bgPrimary && typeof document !== "undefined" && document.body) {
      document.body.style.background = themeObj.bgPrimary;
    }
  };

  window.__cmSetReadOnly = function (readOnly) {
    const isLocked = !!readOnly;
    view.dispatch({
      effects: [
        readOnlyCompartment.reconfigure(EditorState.readOnly.of(isLocked)),
        editableCompartment.reconfigure(EditorView.editable.of(!isLocked)),
      ],
    });
    if (isLocked && view.contentDOM) {
      try { view.contentDOM.blur(); } catch (_) {}
    } else if (!isLocked && !isKmmMode && view.contentDOM) {
      view.contentDOM.removeAttribute("inputmode");
      view.contentDOM.removeAttribute("virtualkeyboardpolicy");
    }
  };

  window.__cmSetKeyboardMouseMode = function (enabled) {
    isKmmMode = !!enabled;
    view.dispatch({
      effects: kmmCompartment.reconfigure(
        isKmmMode
          ? EditorView.contentAttributes.of({
              inputmode: "none",
              virtualkeyboardpolicy: "manual",
              autocomplete: "off",
              autocorrect: "off",
              spellcheck: "false",
              autocapitalize: "off",
            })
          : []
      ),
    });
    if (view && view.contentDOM) {
      if (isKmmMode) {
        view.contentDOM.setAttribute("inputmode", "none");
        view.contentDOM.setAttribute("virtualkeyboardpolicy", "manual");
        view.contentDOM.setAttribute("autocomplete", "off");
        view.contentDOM.setAttribute("autocorrect", "off");
        view.contentDOM.setAttribute("spellcheck", "false");
        view.contentDOM.setAttribute("autocapitalize", "off");
      } else {
        view.contentDOM.removeAttribute("inputmode");
        view.contentDOM.removeAttribute("virtualkeyboardpolicy");
      }
    }
  };

  window.__cmJumpToLine = function (lineNum) {
    try {
      const line = view.state.doc.line(Math.max(1, Math.min(lineNum, view.state.doc.lines)));
      view.dispatch({
        selection: { anchor: line.from },
        scrollIntoView: true,
      });
    } catch (_) {}
  };

  window.__cmFocus = function () {
    try {
      view.focus();
      if (isKmmMode && view.contentDOM) {
        view.contentDOM.setAttribute("inputmode", "none");
        view.contentDOM.setAttribute("virtualkeyboardpolicy", "manual");
      }
    } catch (_) {}
  };

  // Multi-touch gestures & pinch-to-zoom
  let touchStartDist = 0;
  let touchStartAbsDx = 0;
  let isPinching = false;

  window.addEventListener(
    "touchstart",
    function (e) {
      if (e.touches && e.touches.length === 2) {
        lastTouchTime = 0;
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        touchStartDist = Math.hypot(t2.pageX - t1.pageX, t2.pageY - t1.pageY);
        touchStartAbsDx = Math.abs(t2.pageX - t1.pageX);
        isPinching = true;
        post({
          type: "gestureTouchStart",
          dist: touchStartDist,
          absDx: touchStartAbsDx,
        });
      } else if (isPinching) {
        isPinching = false;
        touchStartDist = 0;
        post({ type: "gestureTouchEnd" });
      }
    },
    { passive: true }
  );

  window.addEventListener(
    "touchmove",
    function (e) {
      if (isPinching && e.touches && e.touches.length === 2 && touchStartDist > 0) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const currentDist = Math.hypot(t2.pageX - t1.pageX, t2.pageY - t1.pageY);
        const currentAbsDx = Math.abs(t2.pageX - t1.pageX);
        post({
          type: "gestureTouchMove",
          dist: currentDist,
          absDx: currentAbsDx,
        });
        if (e.cancelable) {
          e.preventDefault();
        }
      }
    },
    { passive: false }
  );

  function handleTouchEnd() {
    if (isPinching) {
      isPinching = false;
      touchStartDist = 0;
      post({ type: "gestureTouchEnd" });
    }
  }

  window.addEventListener("touchend", handleTouchEnd, { passive: true });
  window.addEventListener("touchcancel", handleTouchEnd, { passive: true });

  // Mouse wheel with Ctrl / trackpad pinch zoom
  let lastWheelTime = 0;
  window.addEventListener(
    "wheel",
    function (e) {
      if (e.ctrlKey || e.metaKey) {
        if (e.cancelable) e.preventDefault();
        const now = Date.now();
        if (now - lastWheelTime < 40) return;
        lastWheelTime = now;
        if (e.deltaY < 0) {
          post({ type: "zoomIn" });
        } else if (e.deltaY > 0) {
          post({ type: "zoomOut" });
        }
      }
    },
    { passive: false }
  );

  // Keyboard zoom shortcuts: Ctrl+= / Ctrl+- / Ctrl+0
  window.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey) {
      const key = e.key;
      const code = e.code;
      if (key === "=" || key === "+" || code === "Equal" || code === "NumpadAdd") {
        if (e.cancelable) e.preventDefault();
        post({ type: "zoomIn" });
      } else if (key === "-" || key === "_" || code === "Minus" || code === "NumpadSubtract") {
        if (e.cancelable) e.preventDefault();
        post({ type: "zoomOut" });
      } else if (key === "0" || code === "Digit0" || code === "Numpad0") {
        if (e.cancelable) e.preventDefault();
        post({ type: "zoomReset" });
      }
    }
  });

  post({ type: "ready" });
})();
