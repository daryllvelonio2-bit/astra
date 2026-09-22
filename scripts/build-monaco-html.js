/**
 * Builds src/ide/components/editor/monacoEngineHtml.generated.ts by bundling
 * the VS Code core (monaco-editor ESM + 7 static Monarch grammars + jsonc
 * JSON support) into a single offline classic-script page for a HIDDEN
 * headless WebView. No view is ever created; no workers, fetch, or modules.
 *
 * Mirrors scripts/build-xterm-html.js: esbuild IIFE inlined via a function
 * replacer (avoids `$`-substitution), blob JSON-escaped into generated TS.
 *
 * Run: node scripts/build-monaco-html.js
 * Re-run after any `monaco-editor` upgrade.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const esbuild = require(path.join(ROOT, "node_modules", "esbuild", "lib", "main.js"));

const ENTRY_SRC = fs.readFileSync(path.join(__dirname, "monaco-languages-entry.js"), "utf8");
const ENGINE_JS = fs.readFileSync(path.join(__dirname, "monaco-engine.js"), "utf8");

// NOTE: the temp entry MUST live inside the project tree — esbuild resolves
// bare `monaco-editor/...` imports by walking up from the importer, and a
// tmpdir entry (os.tmpdir) never reaches the project's node_modules.
const tmpDir = fs.mkdtempSync(path.join(ROOT, "scripts", ".tmp-monaco-engine-"));
const tmpEntry = path.join(tmpDir, "entry.js");
fs.writeFileSync(tmpEntry, ENTRY_SRC);

const tmpOut = path.join(tmpDir, "monaco.bundle.js");
esbuild.buildSync({
  entryPoints: [tmpEntry],
  bundle: true,
  format: "iife",
  platform: "browser",
  minify: true,
  outfile: tmpOut,
  logLevel: "warning",
  loader: { ".ttf": "dataurl" },
});

const bundleJs = fs.readFileSync(tmpOut, "utf8");
fs.rmSync(tmpDir, { recursive: true, force: true });

const html = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>html, body { margin: 0; padding: 0; background: __BG__; overflow: hidden; }</style>
</head>
<body>
<script>__MONACO_JS__</script>
<script>__ENGINE_JS__</script>
</body>
</html>`;

const withLibs = html
  .replaceAll("__MONACO_JS__", () => bundleJs)
  .replaceAll("__ENGINE_JS__", () => ENGINE_JS);

const jsonPath = path.join(ROOT, "src/ide/components/editor/monacoEngineHtml.json");
fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
fs.writeFileSync(jsonPath, JSON.stringify({ html: withLibs }));
console.log("wrote", jsonPath, Buffer.byteLength(fs.readFileSync(jsonPath)), "bytes");

const out = `// GENERATED — do not hand-edit. Regenerate with: node scripts/build-monaco-html.js
// Headless VS Code core (Monarch tokenize only) for a hidden WebView.
// Background is token-replaced at runtime to avoid any visible flash.
// Speed: the 4MB payload is required lazily so bundle startup never pays
// for its evaluation — first editor use only.
let cachedHtml: string | null = null;

function getMonacoHtml(): string {
  if (cachedHtml === null) {
    cachedHtml = (require("./monacoEngineHtml.json") as { html: string }).html;
  }
  return cachedHtml;
}

export function buildMonacoHtml(background: string): string {
  return getMonacoHtml().replaceAll("__BG__", () => background);
}
`;

const outPath = path.join(ROOT, "src/ide/components/editor/monacoEngineHtml.generated.ts");
fs.writeFileSync(outPath, out);
console.log("wrote", outPath, Buffer.byteLength(out), "bytes");
