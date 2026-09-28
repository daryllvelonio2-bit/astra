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
  view.dom.addEventListener("keydown", function (e) {
    if (e.key === "Escape") window.__cmFindOpen = false;
  });

  // Multi-touch gestures & pinch-to-zoom
  let touchStartDist = 0;
  let touchStartAbsDx = 0;
  let isPinching = false;

  // Single-touch scroll against left boundary -> pull explorer
  let singleTouchStartScreenX = 0;
  let singleTouchStartScreenY = 0;
  let singleTouchStartTime = 0;
  let isPullingSidebar = false;
  let pullInitialScrollLeft = 0;
  let isSidebarPullEnabled = false;

  window.__cmSetSidebarPullEnabled = function (enabled) {
    isSidebarPullEnabled = !!enabled;
  };

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

      if (e.touches && e.touches.length === 1) {
        const t = e.touches[0];
        singleTouchStartScreenX = t.screenX || t.pageX;
        singleTouchStartScreenY = t.screenY || t.pageY;
        singleTouchStartTime = Date.now();
        isPullingSidebar = false;
        pullInitialScrollLeft = view.scrollDOM ? view.scrollDOM.scrollLeft : 0;
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
      } else if (isSidebarPullEnabled && !isPinching && e.touches && e.touches.length === 1) {
        const t = e.touches[0];
        const curX = t.screenX || t.pageX;
        const curY = t.screenY || t.pageY;
        const dx = curX - singleTouchStartScreenX;
        const dy = curY - singleTouchStartScreenY;
        const currentScrollLeft = view.scrollDOM ? view.scrollDOM.scrollLeft : 0;

        if (!isPullingSidebar) {
          // If swiped rightwards past 12px, predominantly horizontal, and scroll is at left edge
          if (dx > 12 && Math.abs(dx) > Math.abs(dy) * 1.1 && (pullInitialScrollLeft <= 1 || currentScrollLeft <= 1)) {
            isPullingSidebar = true;
            post({ type: "editorPullStart" });
          }
        }

        if (isPullingSidebar) {
          post({ type: "editorPullMove", dx: Math.max(0, dx) });
          if (e.cancelable) {
            e.preventDefault();
          }
        }
      }
    },
    { passive: false }
  );

  function handleTouchEnd(e) {
    if (isPinching) {
      isPinching = false;
      touchStartDist = 0;
      post({ type: "gestureTouchEnd" });
    }
    if (isPullingSidebar) {
      isPullingSidebar = false;
      const dt = Math.max(1, Date.now() - singleTouchStartTime);
      const lastTouch = (e && e.changedTouches && e.changedTouches[0]) || (e && e.touches && e.touches[0]);
      const lastX = lastTouch ? (lastTouch.screenX || lastTouch.pageX) : singleTouchStartScreenX;
      const dx = lastX - singleTouchStartScreenX;
      const vx = dx / dt;
      post({ type: "editorPullEnd", dx: Math.max(0, dx), vx: vx });
    }
  }

  window.addEventListener("touchend", handleTouchEnd, { passive: true });
  window.addEventListener("touchcancel", function () {
    if (isPinching) {
      isPinching = false;
      post({ type: "gestureTouchEnd" });
    }
    if (isPullingSidebar) {
      isPullingSidebar = false;
      post({ type: "editorPullEnd", dx: 0, vx: 0 });
    }
  }, { passive: true });

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
