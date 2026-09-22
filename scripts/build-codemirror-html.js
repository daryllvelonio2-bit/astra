const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const ROOT = path.resolve(__dirname, "..");
const entryFile = path.join(__dirname, "codemirror-entry.js");

console.log("Bundling CodeMirror 6 with esbuild...");
const result = esbuild.buildSync({
  entryPoints: [entryFile],
  bundle: true,
  format: "iife",
  platform: "browser",
  minify: true,
  write: false,
  logLevel: "warning",
});

const bundleJs = result.outputFiles[0].text;
console.log("Bundle JS size:", (bundleJs.length / 1024).toFixed(1), "KB");

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  height: 100%;
  width: 100%;
  background: __BG__;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
#editor {
  height: 100%;
  width: 100%;
}
.cm-editor {
  height: 100%;
}
.cm-scroller {
  overflow: auto;
}
.cm-gutters {
  user-select: none;
  -webkit-user-select: none;
}
</style>
</head>
<body>
<div id="editor"></div>
<script>window.__INITIAL_IS_DARK__ = __IS_DARK__;</script>
<script>${bundleJs}</script>
</body>
</html>`;

const outTs = `// GENERATED — do not hand-edit. Regenerate with: node scripts/build-codemirror-html.js
// Inlines CodeMirror 6 core + language extensions + themes into an offline HTML page.
export interface CodeMirrorHtmlOptions {
  background: string;
  isDark?: boolean;
}

let cachedBlob: string | null = null;
function getBlob(): string {
  if (cachedBlob !== null) return cachedBlob;
  cachedBlob = ${JSON.stringify(html)};
  return cachedBlob;
}

export function buildCodeMirrorHtml(options: CodeMirrorHtmlOptions): string {
  const isDark = options.isDark !== false;
  return getBlob()
    .replaceAll("__BG__", () => options.background || (isDark ? "#131314" : "#ffffff"))
    .replaceAll("__IS_DARK__", () => JSON.stringify(isDark));
}
`;

const outPath = path.join(ROOT, "src/ide/components/editor/codemirrorHtml.generated.ts");
fs.writeFileSync(outPath, outTs);
console.log("Wrote:", outPath, Buffer.byteLength(outTs), "bytes");
