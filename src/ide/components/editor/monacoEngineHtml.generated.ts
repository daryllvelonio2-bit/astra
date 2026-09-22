// GENERATED — do not hand-edit. Regenerate with: node scripts/build-monaco-html.js
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
