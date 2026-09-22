/**
 * Headless Monaco engine (classic script, no modules/imports/fetch/Workers).
 * Runs AFTER the esbuild IIFE bundle which sets `globalThis.__monaco`.
 * Exposes tokenization only: RN sends code, engine posts back
 * offset+scope pairs per line. Rendering stays 100% native.
 *
 * Inlined by scripts/build-monaco-html.js via the __ENGINE_JS__ token.
 */
(function () {
  var post = function (m) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify(m));
    } catch (e) {}
  };

  window.__monacoTokens = function (id, code, lang) {
    try {
      var monaco = globalThis.__monaco;
      if (!monaco || !monaco.editor || !monaco.editor.tokenize) {
        post({ type: "monaco-tokens", id: id, error: "no-engine" });
        return;
      }
      var src = typeof code === "string" ? code : "";
      var lines = monaco.editor.tokenize(src, lang || "plaintext");
      var out = [];
      for (var i = 0; i < lines.length; i++) {
        var toks = [];
        var row = lines[i] || [];
        for (var j = 0; j < row.length; j++) {
          toks.push([row[j].offset | 0, row[j].type || ""]);
        }
        out.push(toks);
      }
      post({ type: "monaco-tokens", id: id, lines: out });
    } catch (e) {
      post({ type: "monaco-tokens", id: id, error: String((e && e.message) || e) });
    }
  };

  window.__monacoPing = function () {
    post({
      type: "monaco-ready",
      hasEngine: !!(globalThis.__monaco && globalThis.__monaco.editor),
    });
  };

  post({
    type: "monaco-ready",
    hasEngine: !!(globalThis.__monaco && globalThis.__monaco.editor),
  });
})();
