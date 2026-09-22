import { ExecutionRequest, ExecutionResult } from "./types";
import { runClientJavaScript } from "./clientRunner";
import { PhpEngineService } from "../../ide/services/phpEngineService";
import { PRootService } from "../../ide/services/prootService";

/**
 * Universal Native Execution Engine for Astra AI:
 * Fully powered by the local Debian Linux PRoot Sandbox & Terminal environment.
 * Zero external cloud execution dependencies.
 */
export async function executeCode(request: ExecutionRequest): Promise<ExecutionResult> {
  const { code, language, workspaceId } = request;
  const trimmed = (code || "").trim();
  const lang = (language || "javascript").toLowerCase();

  // 1. Detect if code is a shell command or project runner command
  const isShell = ["bash", "sh", "shell", "zsh", "terminal", "cmd", "console"].includes(lang);
  const isCliPattern =
    isShell ||
    /^(python[3]?|node|npm|npx|pip[3]?|php|cargo|go|gcc|g\+\+|clang|rustc|make|git|deno|bun|yarn|pnpm|composer|apt-get|apt|docker|uvicorn|flask|django-admin|cat|ls|pwd|echo|curl|wget)\s+/i.test(
      trimmed
    );

  if (isCliPattern) {
    try {
      const prootRes = await PRootService.runCommand(trimmed, workspaceId);
      if (prootRes && (prootRes.stdout || prootRes.stderr)) {
        return {
          stdout: prootRes.stdout,
          stderr: prootRes.stderr,
          exitCode: prootRes.exitCode,
          environment: "Debian Linux Sandbox",
        };
      }
    } catch (err: any) {
      return {
        stdout: "",
        stderr: err.message || String(err),
        exitCode: 1,
        environment: "Debian Linux Sandbox",
      };
    }
  }

  // 2. PHP Language execution
  if (lang === "php") {
    try {
      const output = await PhpEngineService.runPhpCode(trimmed);
      return { stdout: output, stderr: "", exitCode: 0, environment: "PHP Engine" };
    } catch (err: any) {
      return { stdout: "", stderr: err.message || String(err), exitCode: 1, environment: "PHP Engine" };
    }
  }

  // 3. JavaScript / TypeScript execution
  if (lang === "javascript" || lang === "js" || lang === "node") {
    // Try running directly in PRoot if available
    try {
      const res = await PRootService.runCommand(`node -e ${JSON.stringify(trimmed)}`, workspaceId);
      if (res && (res.stdout || res.stderr) && !res.stdout.startsWith("[LinuxRunner Fallback]")) {
        return { stdout: res.stdout, stderr: res.stderr, exitCode: res.exitCode, environment: "Node.js (PRoot)" };
      }
    } catch (_) {}
    const jsRes = await runClientJavaScript(trimmed);
    return { ...jsRes, environment: "JavaScript Runtime" };
  }

  // 4. Python language execution
  if (lang === "python" || lang === "py" || lang === "python3") {
    try {
      const res = await PRootService.runCommand(`python3 -c ${JSON.stringify(trimmed)}`, workspaceId);
      return { stdout: res.stdout, stderr: res.stderr, exitCode: res.exitCode, environment: "Python (PRoot)" };
    } catch (err: any) {
      return { stdout: "", stderr: err.message || String(err), exitCode: 1, environment: "Python (PRoot)" };
    }
  }

  // 5. Generic language execution via PRoot Linux environment
  try {
    const res = await PRootService.runCommand(trimmed, workspaceId);
    return {
      stdout: res.stdout,
      stderr: res.stderr,
      exitCode: res.exitCode,
      environment: "Debian Linux Sandbox",
    };
  } catch (err: any) {
    return {
      stdout: "",
      stderr: err.message || `No local interpreter found for ${lang}`,
      exitCode: 1,
      environment: "Debian Linux Sandbox",
    };
  }
}
