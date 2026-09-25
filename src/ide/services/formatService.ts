import { loadExtensionRegistry } from "./extensions/extensionRegistry";
import { InstalledExtension } from "./extensions/types";
import { executeCommand } from "../../../modules/linux-runner/src";
import { PRootService } from "./prootService";

export interface FormatResult {
  success: boolean;
  formatted: string;
  changed: boolean;
  engine: string; // e.g. "Prettier", "Black", "Clang-Format", or "None"
  message: string;
}

/**
 * Checks if an installed extension provides formatting capabilities.
 */
export function isFormatterExtension(ext: InstalledExtension): boolean {
  const cats = (ext.categories || []).map((c) => c.toLowerCase());
  if (cats.includes("formatters")) return true;

  const kw = (ext.keywords || []).map((k) => k.toLowerCase());
  if (kw.includes("formatter") || kw.includes("formatting") || kw.includes("format")) return true;

  const id = ext.id.toLowerCase();
  return (
    id.includes("prettier") ||
    id.includes("beautify") ||
    id.includes("format") ||
    id.includes("black") ||
    id.includes("autopep8") ||
    id.includes("clang-format") ||
    id.includes("rustfmt") ||
    id.includes("gofmt") ||
    id.includes("sql-formatter")
  );
}

/**
 * Returns all active (installed & enabled) formatter extensions.
 */
export async function getActiveFormatters(): Promise<InstalledExtension[]> {
  try {
    const registry = await loadExtensionRegistry();
    return Object.values(registry.installed).filter((ext) => ext.enabled && isFormatterExtension(ext));
  } catch {
    return [];
  }
}

/**
 * Checks if a specific extension ID or name is installed and active.
 */
export async function isExtensionFormatterActive(idOrKeyword: string): Promise<boolean> {
  const active = await getActiveFormatters();
  const lower = idOrKeyword.toLowerCase();
  return active.some((ext) => ext.id.toLowerCase().includes(lower) || ext.displayName.toLowerCase().includes(lower));
}

/**
 * Safely writes text to a path inside Debian PRoot without exceeding ARG_MAX.
 * Uses 32KB base64 chunks (multiple of 4) piped to `base64 -d`.
 */
async function writeProotTempFile(tmpPath: string, content: string): Promise<boolean> {
  const b64 = Buffer.from(content, "utf8").toString("base64");
  const CHUNK_SIZE = 32768;
  if (b64.length <= CHUNK_SIZE) {
    const res = await executeCommand(`printf '%s' "${b64}" | base64 -d > "${tmpPath}"`);
    return res.exitCode === 0;
  }
  await executeCommand(`: > "${tmpPath}"`);
  for (let i = 0; i < b64.length; i += CHUNK_SIZE) {
    const chunk = b64.slice(i, i + CHUNK_SIZE);
    const res = await executeCommand(`printf '%s' "${chunk}" | base64 -d >> "${tmpPath}"`);
    if (res.exitCode !== 0) return false;
  }
  return true;
}

/**
 * Runs Prettier inside Linux PRoot via Node.js using extension files.
 */
async function runPrettierInPRoot(code: string, fileName: string, tabSize: number): Promise<string | null> {
  const ready = await PRootService.ensureReady();
  if (!ready) return null;

  const tmpIn = `/tmp/fmt_in_${Date.now()}.tmp`;
  const tmpOut = `/tmp/fmt_out_${Date.now()}.tmp`;

  try {
    const written = await writeProotTempFile(tmpIn, code);
    if (!written) return null;

    const nodeScript = `
      const fs = require('fs');
      let prettier;
      const paths = [
        '/root/.local/share/code-server/extensions/esbenp.prettier-vscode/node_modules/prettier',
        '/extensions/esbenp.prettier-vscode/node_modules/prettier',
        'prettier'
      ];
      for (const p of paths) {
        try { prettier = require(p); break; } catch(e) {}
      }
      if (!prettier) { process.exit(3); }
      const content = fs.readFileSync('${tmpIn}', 'utf8');
      prettier.format(content, {
        filepath: '${fileName}',
        tabWidth: ${tabSize},
        semi: true,
        singleQuote: false,
        trailingComma: 'es5',
      }).then(res => {
        fs.writeFileSync('${tmpOut}', res, 'utf8');
        process.exit(0);
      }).catch(err => {
        process.exit(1);
      });
    `.replace(/\n\s+/g, " ");

    const res = await executeCommand(`node -e "${nodeScript.replace(/"/g, '\\"')}"`);
    if (res.exitCode === 0) {
      const catRes = await executeCommand(`cat "${tmpOut}" 2>/dev/null`);
      if (typeof catRes.stdout === "string" && catRes.stdout.length > 0) {
        return catRes.stdout;
      }
    }
  } catch {
  } finally {
    executeCommand(`rm -f "${tmpIn}" "${tmpOut}" 2>/dev/null`).catch(() => {});
  }

  return null;
}

/**
 * Runs Python formatters (black, autopep8, ruff) inside PRoot if available.
 */
async function runPythonFormatterInPRoot(code: string): Promise<string | null> {
  const ready = await PRootService.ensureReady();
  if (!ready) return null;

  const tmpIn = `/tmp/fmt_py_${Date.now()}.py`;
  try {
    const written = await writeProotTempFile(tmpIn, code);
    if (!written) return null;

    const res = await executeCommand(
      `black -q "${tmpIn}" 2>/dev/null || autopep8 -i "${tmpIn}" 2>/dev/null || ruff format "${tmpIn}" 2>/dev/null`
    );
    if (res.exitCode === 0) {
      const catRes = await executeCommand(`cat "${tmpIn}" 2>/dev/null`);
      if (typeof catRes.stdout === "string" && catRes.stdout.length > 0) {
        return catRes.stdout;
      }
    }
  } catch {
  } finally {
    executeCommand(`rm -f "${tmpIn}" 2>/dev/null`).catch(() => {});
  }
  return null;
}

/**
 * Runs Clang-Format inside PRoot if available.
 */
async function runClangFormatInPRoot(code: string, fileName: string): Promise<string | null> {
  const ready = await PRootService.ensureReady();
  if (!ready) return null;

  const ext = (fileName || "").split(".").pop() || "cpp";
  const tmpIn = `/tmp/fmt_clang_${Date.now()}.${ext}`;
  try {
    const written = await writeProotTempFile(tmpIn, code);
    if (!written) return null;

    const res = await executeCommand(`clang-format -i "${tmpIn}" 2>/dev/null`);
    if (res.exitCode === 0) {
      const catRes = await executeCommand(`cat "${tmpIn}" 2>/dev/null`);
      if (typeof catRes.stdout === "string" && catRes.stdout.length > 0) {
        return catRes.stdout;
      }
    }
  } catch {
  } finally {
    executeCommand(`rm -f "${tmpIn}" 2>/dev/null`).catch(() => {});
  }
  return null;
}

/**
 * Primary document formatter: runs the best matching formatter engine
 * installed via extensions (Prettier, Black, Clang-Format). There is NO
 * built-in formatter: with no engine for this language the document is
 * returned unchanged ("no engine" message) — only explicit, real tools
 * may ever rewrite code.
 */
export async function formatDocument(
  content: string,
  fileName: string = "file.js",
  tabSize: number = 2
): Promise<FormatResult> {
  if (!content || !content.trim()) {
    return {
      success: true,
      formatted: content,
      changed: false,
      engine: "None",
      message: "File is empty",
    };
  }

  const ext = (fileName || "").split(".").pop()?.toLowerCase() || "";
  const activeFormatters = await getActiveFormatters();
  const hasPrettier = activeFormatters.some((e) => e.id.toLowerCase().includes("prettier"));
  const hasBlack = activeFormatters.some((e) => e.id.toLowerCase().includes("black") || e.id.toLowerCase().includes("python"));
  const hasClang = activeFormatters.some((e) => e.id.toLowerCase().includes("clang"));

  // 1. Python files
  if (ext === "py" && hasBlack) {
    const pyFormatted = await runPythonFormatterInPRoot(content);
    if (pyFormatted !== null) {
      const changed = pyFormatted !== content;
      return {
        success: true,
        formatted: pyFormatted,
        changed,
        engine: "Black / Python Formatter",
        message: changed ? "Formatted with Black ✨" : "Already formatted with Black",
      };
    }
  }

  // 2. C / C++ / Java / C# files
  if (["c", "cpp", "h", "hpp", "java", "cs"].includes(ext) && hasClang) {
    const clangFormatted = await runClangFormatInPRoot(content, fileName);
    if (clangFormatted !== null) {
      const changed = clangFormatted !== content;
      return {
        success: true,
        formatted: clangFormatted,
        changed,
        engine: "Clang-Format",
        message: changed ? "Formatted with Clang-Format ✨" : "Already formatted with Clang-Format",
      };
    }
  }

  // 3. Prettier for JS/TS/HTML/CSS/JSON/Markdown/YAML
  const prettierLangs = ["js", "jsx", "ts", "tsx", "mjs", "cjs", "json", "jsonc", "html", "htm", "css", "scss", "less", "md", "markdown", "yaml", "yml", "graphql"];
  if (hasPrettier && prettierLangs.includes(ext)) {
    const prettierFormatted = await runPrettierInPRoot(content, fileName, tabSize);
    if (prettierFormatted !== null) {
      const changed = prettierFormatted !== content;
      return {
        success: true,
        formatted: prettierFormatted,
        changed,
        engine: "Prettier",
        message: changed ? "Formatted with Prettier ✨" : "Already formatted with Prettier",
      };
    }
  }

  // 4. Any other active formatter whose language covers this extension
  const matchingExt = activeFormatters.find((f) => {
    return f.languages.some((l) => (l.extensions || []).some((e) => e.replace(/^\./, "").toLowerCase() === ext));
  });
  if (matchingExt) {
    return {
      success: true,
      formatted: content,
      changed: false,
      engine: matchingExt.displayName,
      message: `${matchingExt.displayName} does not support on-device formatting`,
    };
  }

  // No built-in formatter: leave the document byte-identical.
  return {
    success: true,
    formatted: content,
    changed: false,
    engine: "None",
    message: "No formatter installed for this file",
  };
}
