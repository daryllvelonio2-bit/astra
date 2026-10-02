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
import {
  search,
  searchKeymap,
  highlightSelectionMatches,
  openSearchPanel,
  closeSearchPanel,
} from "@codemirror/search";
import { buildEditorTheme, createFontTheme } from "./codemirror-theme.js";
import { engineExtensions, installSnippetApi } from "./codemirror-extensions.js";
import { initClipboardBridge } from "./codemirror-clipboard.js";
import { initEditorGestures, setGesturePost, setDoubleTapReset, setSidebarPullEnabled } from "./codemirror-gestures.js";
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
    // Find & replace: panel docks at the TOP so the Android soft keyboard
    // never covers the inputs; RN opens it via window.__cmOpenFind / Mod-F.
    search({ top: true }),
    highlightSelectionMatches(),
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...searchKeymap,
      indentWithTab,
    ]),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    // ENGINE add-ons from codemirror-extensions.js (see __cmFeatureNames)
    ...engineExtensions,
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
          // Incremental patch: a plain keystroke must never serialize the
          // ENTIRE document across the WebView bridge. On large files that is
          // an O(n) toString + JSON.stringify + bridge transfer + parse per
          // character — the dominant source of typing lag. Post a single-range
          // patch for the common case; fall back to full text only for
          // genuinely multi-range changes (paste, multi-cursor edits).
          const doc = update.state.doc;
          let patch = null;
          let count = 0;
          update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
            count++;
            if (patch === null) {
              patch = { from: fromA, to: toA, insert: inserted.toString() };
            }
          });
          if (count === 1 && patch) {
            post({ type: "change", patch: patch, length: doc.length });
          } else {
            post({ type: "change", text: doc.toString(), length: doc.length });
          }
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

  // --- Find & Replace bridge (RN touch trigger; keyboard uses searchKeymap) ---
  // __cmFindOpen tracks visibility so the ⋯ menu item toggles the panel
  // (all panel buttons are hidden by theme, so this is the touch close path).
  window.__cmFindOpen = false;
  window.__cmOpenFind = function () {
    try {
      openSearchPanel(view);
      view.focus();
      window.__cmFindOpen = true;
    } catch (_) {}
  };
  window.__cmCloseFind = function () {
    try {
      closeSearchPanel(view);
    } catch (_) {}
    window.__cmFindOpen = false;
  };
  window.__cmIsFindOpen = function () {
    return window.__cmFindOpen === true;
  };
  window.__cmToggleComment = function () { runToggleComment(view); };
  window.__cmFeatureNames = ["toggleComment", "lineWrapping", "bracketMatching", "closeBrackets", "autocompletion"];
  view.dom.addEventListener("keydown", function (e) {
    if (e.key === "Escape") window.__cmFindOpen = false;
  });

  // --- Clipboard bridge (copy/cut/paste over the CM selection; RN touch) ---
  initClipboardBridge(view);

  // --- Marketplace snippet bridge (window.__cmSetSnippets; RN pushes) ---
  installSnippetApi();

  // Multi-touch gestures & pinch-to-zoom + sidebar pull relay
  setGesturePost(post);
  setDoubleTapReset(function () { lastTouchTime = 0; });
  initEditorGestures(view);

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
