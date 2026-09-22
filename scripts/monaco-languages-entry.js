/**
 * VS Code-core language entry for the hidden Monaco engine (tokenize only).
 * Statically imports the 7 needed Monarch grammars so esbuild emits ONE
 * classic-script IIFE with zero dynamic imports, workers, or CSS deps.
 * (Built by scripts/build-monaco-html.js into a temp file; this source is
 * the tracked template. NOTE: monaco-editor exports map => specifiers omit
 * the esm/vs prefix. There is no `json` Monarch dir in 0.56 — JSON uses the
 * main-thread jsonc tokenization support instead.)
 */
import * as monaco from "monaco-editor/editor/editor.api.js";
import { conf as tsConf, language as tsLang } from "monaco-editor/languages/definitions/typescript/typescript.js";
import { conf as jsConf, language as jsLang } from "monaco-editor/languages/definitions/javascript/javascript.js";
import { conf as pyConf, language as pyLang } from "monaco-editor/languages/definitions/python/python.js";
import { conf as htmlConf, language as htmlLang } from "monaco-editor/languages/definitions/html/html.js";
import { conf as cssConf, language as cssLang } from "monaco-editor/languages/definitions/css/css.js";
import { conf as shConf, language as shLang } from "monaco-editor/languages/definitions/shell/shell.js";
import { setupMode as setupJsonMode } from "monaco-editor/languages/features/json/jsonMode.js";
import { jsonDefaults } from "monaco-editor/languages/features/json/register.js";

for (const [id, c, l] of [
  ["typescript", tsConf, tsLang],
  ["javascript", jsConf, jsLang],
  ["python", pyConf, pyLang],
  ["html", htmlConf, htmlLang],
  ["css", cssConf, cssLang],
  ["shell", shConf, shLang],
]) {
  monaco.languages.register({ id });
  monaco.languages.setLanguageConfiguration(id, c);
  monaco.languages.setMonarchTokensProvider(id, l);
}

setupJsonMode(jsonDefaults);

globalThis.__monaco = monaco;
