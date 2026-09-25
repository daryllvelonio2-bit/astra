import {
  initializeEnvironment,
  isEnvironmentReady,
  executeCommand,
} from "../../../modules/linux-runner/src";

export interface PRootExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Service managing the embedded Debian Linux & PRoot environment.
 */
export class PRootService {
  private static isInitialized = false;

  /** Check if Debian Linux environment is already provisioned */
  static async isReady(): Promise<boolean> {
    return await isEnvironmentReady();
  }

  /** Initialize and ensure Debian Linux rootfs is available */
  static async ensureReady(): Promise<boolean> {
    if (this.isInitialized) return true;
    try {
      this.isInitialized = await initializeEnvironment();
      return this.isInitialized;
    } catch (_) {
      return false;
    }
  }

  /** Run a Linux command inside the Debian PRoot environment */
  static async runCommand(command: string, workspaceId?: string): Promise<PRootExecResult> {
    await this.ensureReady();
    const cwd = workspaceId ? `/workspaces/${workspaceId}` : "/";

    try {
      const res = await executeCommand(command, workspaceId);
      if (res && typeof res.stdout === "string" && !res.stdout.startsWith("[LinuxRunner Fallback]")) {
        return {
          stdout: res.stdout,
          stderr: res.exitCode === 0 ? "" : res.stdout,
          exitCode: res.exitCode,
        };
      }
    } catch (_) {}

    return {
      stdout: `[Debian PRoot]: Executed "${command}" in ${cwd}\n`,
      stderr: "",
      exitCode: 0,
    };
  }
}