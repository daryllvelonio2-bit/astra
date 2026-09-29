// ENGINE clipboard bridge for the Astra editor. Imported by
// codemirror-entry.js; RN triggers the flows through the
// window.__cmCopy / __cmCut / __cmPaste exposes below.
//
// Why execCommand: the WebView is a plain blob page — CodeMirror edits its
// contentDOM directly, so only copy/cut (or a synthetic Ctrl+V keydown for
// paste) reach the Android system clipboard through the browser's editing
// commands. No editor-instance plumbing is needed.
//
// Selection state lives in one place (getSelectionText) so the flows agree:
// an empty selection means NO-OP for copy/cut (never clobber the system
// clipboard with an empty string) and "whole line" for paste-with-empty-
// selection parity with desktop editors.

function getSelectionText(view) {
  try {
    const sel = view.state.selection.main;
    if (sel.empty) return null;
    return view.state.doc.sliceString(sel.from, sel.to);
  } catch (_) {
    return null;
  }
}

function selectWholeLine(view) {
  try {
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    view.dispatch({ selection: { anchor: line.from, head: line.to }, scrollIntoView: false });
  } catch (_) {}
}

function runCopy(view) {
  const text = getSelectionText(view);
  if (text === null) return false;
  try { document.execCommand("copy"); } catch (_) {}
  return true;
}

function runCut(view) {
  const text = getSelectionText(view);
  if (text === null) return false;
  try { document.execCommand("cut"); } catch (_) {}
  return true;
}

function insertPastedText(view, text) {
  try {
    const sel = view.state.selection.main;
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: text },
      // Place the caret after the inserted text (desktop paste semantics).
      selection: { anchor: sel.from + text.length },
      scrollIntoView: true,
    });
    view.focus();
  } catch (_) {}
}

function pasteFromSystemClipboard() {
  // Preferred: real clipboard read (works on modern Android WebView when
  // the user granted clipboard access).
  if (navigator.clipboard && typeof navigator.clipboard.readText === "function") {
    navigator.clipboard
      .readText()
      .then((text) => {
        if (typeof text === "string" && text.length > 0 && window.__cmView) insertPastedText(window.__cmView, text);
      })
      .catch(() => {
        // Fallback: a synthetic Ctrl+V lets the WebView's own paste path
        // run (it asks the system for clipboard content itself).
        try {
          const content = document.querySelector(".cm-content");
          if (content) {
            const e = new KeyboardEvent("keydown", {
              key: "v", code: "KeyV", keyCode: 86, which: 86,
              cancelable: true, bubbles: true,
              ctrlKey: true, altKey: false, metaKey: false, shiftKey: false,
            });
            content.dispatchEvent(e);
          }
        } catch (_) {}
      });
    return;
  }
  // No async clipboard API at all: go straight to the synthetic keydown.
  try {
    const content = document.querySelector(".cm-content");
    if (content) {
      const e = new KeyboardEvent("keydown", {
        key: "v", code: "KeyV", keyCode: 86, which: 86,
        cancelable: true, bubbles: true,
        ctrlKey: true, altKey: false, metaKey: false, shiftKey: false,
      });
      content.dispatchEvent(e);
    }
  } catch (_) {}
}

export function initClipboardBridge(view) {
  // Shared handle: the async clipboard promise path resolves the live view
  // through window state, not a closure.
  window.__cmView = view;

  window.__cmCopy = function () {
    // Empty selection: select the cursor's line first, then copy it.
    if (getSelectionText(view) === null) {
      selectWholeLine(view);
      if (getSelectionText(view) === null) return false;
    }
    return runCopy(view);
  };

  window.__cmCut = function () {
    if (getSelectionText(view) === null) {
      selectWholeLine(view);
      if (getSelectionText(view) === null) return false;
    }
    return runCut(view);
  };

  // The promise path reads the view through window state (not a closure),
  // so late async paste results always dispatch on the live editor.
  window.__cmPaste = pasteFromSystemClipboard;

  return view;
}
