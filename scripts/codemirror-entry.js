import { EditorView, basicSetup } from "codemirror";
import { EditorState, Compartment } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import { javascript } from "@codemirror/lang-javascript";
import { html as htmlLang } from "@codemirror/lang-html";
import { css as cssLang } from "@codemirror/lang-css";
import { json as jsonLang } from "@codemirror/lang-json";
import { oneDark } from "@codemirror/theme-one-dark";

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

  const customLightTheme = EditorView.theme({
    "&": {
      color: "#24292e",
      backgroundColor: "#ffffff",
    },
    ".cm-content": {
      caretColor: "#0969da",
    },
    "&.cm-focused .cm-cursor": {
      borderLeftColor: "#0969da",
    },
    "&.cm-focused .cm-selectionBackground, ::selection": {
      backgroundColor: "#b4d5fe",
    },
    ".cm-gutters": {
      backgroundColor: "#f6f8fa",
      color: "#6e7781",
      borderRight: "1px solid #d0d7de",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(0, 0, 0, 0.04)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "rgba(0, 0, 0, 0.06)",
      color: "#24292e",
    },
  }, { dark: false });

  const initialIsDark =
    typeof window !== "undefined" && typeof window.__INITIAL_IS_DARK__ === "boolean"
      ? window.__INITIAL_IS_DARK__
      : true;

  const startState = EditorState.create({
    doc: "",
    extensions: [
      basicSetup,
      keymap.of([indentWithTab]),
      languageCompartment.of([]),
      themeCompartment.of(initialIsDark ? oneDark : customLightTheme),
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
  document.documentElement.style.setProperty('--gutter-bg', initialIsDark ? '#282c34' : '#f6f8fa');

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

  window.__cmSetTheme = function (isDark, bg) {
    view.dispatch({
      effects: themeCompartment.reconfigure(isDark ? oneDark : customLightTheme),
    });
    document.documentElement.style.setProperty('--gutter-bg', isDark ? '#282c34' : '#f6f8fa');
    if (bg && typeof document !== "undefined" && document.body) {
      document.body.style.background = bg;
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
