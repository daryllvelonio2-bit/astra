/**
 * Builds src/ide/components/terminal/xtermHtml.generated.ts by inlining the
 * xterm.js distribution (lib + fit addon + web-links addon + css) into a
 * single offline HTML page. The generated blob is JSON-escaped so xterm
 * source can contain any characters safely; runtime colors are token-replaced
 * by buildXtermHtml().
 *
 * Run: node scripts/build-xterm-html.js
 * Re-run after any `npm install xterm` / `@xterm/addon-*` upgrade.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const xtermJs = read("node_modules/xterm/lib/xterm.js");
const fitJs = read("node_modules/@xterm/addon-fit/lib/addon-fit.js");
const linksJs = read("node_modules/@xterm/addon-web-links/lib/addon-web-links.js");
const xtermCss = read("node_modules/xterm/css/xterm.css");
const xtermRuntime = require("./xterm-runtime.js");

const html = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>__XTERM_CSS__</style>
<style>
html, body {
  margin: 0;
  padding: 0;
  height: 100%;
  background: __BG__;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
#terminal {
  height: 100%;
  width: 100%;
  padding: 6px 8px;
  box-sizing: border-box;
}
.xterm-helper-textarea { opacity: 0 !important; }
.xterm .xterm-viewport { background-color: transparent !important; }
</style>
</head>
<body>
<div id="terminal"></div>
<script>__XTERM_JS__</script>
<script>__FIT_JS__</script>
<script>__WEBLINKS_JS__</script>
<script>
__XTERM_RUNTIME__
</script>
</body>
</html>`;

const withLibs = html
  .replaceAll("__XTERM_CSS__", () => xtermCss)
  .replaceAll("__XTERM_JS__", () => xtermJs)
  .replaceAll("__FIT_JS__", () => fitJs)
  .replaceAll("__WEBLINKS_JS__", () => linksJs)
  .replaceAll("__XTERM_RUNTIME__", () => xtermRuntime);

const out = `// GENERATED — do not hand-edit. Regenerate with: node scripts/build-xterm-html.js
// Inlines xterm.js + fit addon + css into one offline page; colors/fonts are
// token-replaced at runtime by buildXtermHtml().
// Speed: the ~300KB page literal evaluates on first terminal use, not app
// start (this module loads with the IDE shell). Cached after first build.
export interface XtermHtmlOptions {
  background: string;
  foreground: string;
  cursor: string;
  fontSize: number;
  theme?: Record<string, string>;
}

let blobCache: string | null = null;
function getBlob(): string {
  if (blobCache !== null) return blobCache;
  blobCache = ${JSON.stringify(withLibs)};
  return blobCache;
}

export function buildXtermHtml(o: XtermHtmlOptions): string {
  const themeObj = o.theme || {
    background: o.background,
    foreground: o.foreground,
    cursor: o.cursor,
  };
  return getBlob().replaceAll("__BG__", () => o.background)
    .replaceAll("__FG__", () => o.foreground)
    .replaceAll("__CURSOR__", () => o.cursor)
    .replaceAll("__FONT__", () => String(o.fontSize))
    .replaceAll("__THEME_JSON__", () => JSON.stringify(themeObj));
}
`;

const outPath = path.join(ROOT, "src/ide/components/terminal/xtermHtml.generated.ts");
fs.writeFileSync(outPath, out);
console.log("wrote", outPath, Buffer.byteLength(out), "bytes");
