import { readFileContent, saveFileContent } from "./workspaceService";
import { readDir } from "./nativeFs";
import { PhpEngineService } from "./phpEngineService";
import { PRootService } from "./prootService";
import { runClientJavaScript } from "../../ai/runner/clientRunner";
import * as FileSystem from "expo-file-system/legacy";

const WORKSPACES_DIR = `${FileSystem.documentDirectory}workspaces/`;

export interface CommandExecutionResult {
  text?: string;
  error?: string;
  isSystem?: boolean;
}

/**
 * Universal command runner supporting Linux shell, PHP, Python, JS/TS,
 * C/C++, Go, Rust, Ruby, Java, Dart, Lua, SQLite, APT & Composer.
 */
export async function dispatchTerminalCommand(
  cmd: string,
  workspaceId: string
): Promise<CommandExecutionResult> {
  const trimmed = cmd.trim();
  if (!trimmed) return {};

  // 1. Direct Debian Linux (PRoot) Command Execution
  const prootRes = await PRootService.runCommand(trimmed, workspaceId);
  if (prootRes && (prootRes.stdout || prootRes.stderr) && !prootRes.stdout.startsWith("[LinuxRunner Fallback]")) {
    return {
      text: prootRes.stdout || undefined,
      error: prootRes.stderr || undefined,
    };
  }

  // 2. Local Fallback Filesystem Utilities (ls, cat, echo)
  if (trimmed === "ls" || trimmed === "dir") {
    try {
      const files = await readDir(`${WORKSPACES_DIR}${workspaceId}/`);
      return { text: files.length > 0 ? files.join("   ") : "(Empty workspace directory)" };
    } catch (e: any) {
      return { error: `Error listing directory: ${e.message}` };
    }
  }

  if (trimmed.startsWith("cat ")) {
    const fileName = trimmed.slice(4).trim();
    const content = await readFileContent(workspaceId, fileName);
    return content ? { text: content } : { error: `(File "${fileName}" not found or empty)` };
  }

  if (trimmed.startsWith("echo ") && trimmed.includes(" > ")) {
    const parts = trimmed.slice(5).split(" > ");
    const text = parts[0].trim().replace(/^["']|["']$/g, "");
    const targetFile = parts[1].trim();
    await saveFileContent(workspaceId, targetFile, text);
    return { text: `Wrote ${text.length} bytes to ${targetFile}` };
  }

  // 2. Laravel Artisan
  if (trimmed.startsWith("php artisan") || trimmed.startsWith("artisan")) {
    const rawArgs = trimmed.replace(/^(php\s+)?artisan\s*/, "").trim();
    const args = rawArgs ? rawArgs.split(/\s+/).filter(Boolean) : ["list"];
    const out = await PhpEngineService.runArtisan(args, workspaceId);
    return { text: out };
  }

  // 3. PHP Execution
  if (trimmed === "php") {
    return {
      text: "PHP 8.2 CLI Engine (Embedded & Runner Active)\nUsage: php <file.php> | php -r '<code>' | php artisan <cmd>",
      isSystem: true,
    };
  }
  if (trimmed.startsWith("php ")) {
    let rawArg = trimmed.slice(4).trim();
    if (rawArg.startsWith("-r ")) {
      rawArg = rawArg.slice(3).trim().replace(/^["']|["']$/g, "");
    }
    let phpCode = rawArg;
    if (rawArg.endsWith(".php")) {
      const content = await readFileContent(workspaceId, rawArg);
      phpCode = content || `<?php echo "File ${rawArg} is empty.\\n";`;
    } else if (!phpCode.includes("<?php")) {
      phpCode = `<?php\n${phpCode}`;
    }
    const out = await PhpEngineService.runPhpCode(phpCode);
    return { text: out };
  }

  // 4. Linux Package Management (APT & Composer & PRoot)
  if (trimmed.startsWith("apt-get ") || trimmed.startsWith("apt ") || trimmed === "apt-get" || trimmed === "apt" || trimmed.startsWith("composer ") || trimmed === "composer") {
    const res = await PRootService.runCommand(trimmed, workspaceId);
    return { text: res.stdout, error: res.stderr || undefined };
  }

  // 5. Multi-Language CLI Interpreters (Python, Ruby, Go, Rust, C/C++, Java, Dart, Lua, Bash, SQLite)
  const langMatch = trimmed.match(/^(python3?|ruby|go|rustc|gcc|g\+\+|clang|java|dart|lua|bash|sh|sqlite3)\s*(.*)$/);
  if (langMatch) {
    const engine = langMatch[1];
    let arg = langMatch[2]?.trim();
    if (!arg) {
      return { text: `${engine.toUpperCase()} Runner Active\nUsage: ${engine} <file> or ${engine} <code>`, isSystem: true };
    }
    const res = await PRootService.runCommand(trimmed, workspaceId);
    return { text: res.stdout || undefined, error: res.stderr || undefined };
  }

  // 6. JavaScript / Node.js
  let jsCode = trimmed;
  if (jsCode.startsWith("node ")) jsCode = jsCode.slice(5).trim();
  if (jsCode.endsWith(".js") || jsCode.endsWith(".ts")) {
    const content = await readFileContent(workspaceId, jsCode);
    if (content) jsCode = content;
  }
  const jsRes = await runClientJavaScript(jsCode);
  return { text: jsRes.stdout || undefined, error: jsRes.stderr || undefined };
}
