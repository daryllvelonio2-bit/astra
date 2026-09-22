import { requireNativeModule, EventEmitter } from 'expo-modules-core';

let LinuxRunnerModule: any = null;
try {
  LinuxRunnerModule = requireNativeModule('LinuxRunner');
} catch (_) {
  LinuxRunnerModule = null;
}

const emitter: any = LinuxRunnerModule
  ? new EventEmitter(LinuxRunnerModule)
  : ({ addListener: () => ({ remove: () => {} }) } as any);

export interface ExecutionResult {
  stdout: string;
  exitCode: number;
}

export async function isEnvironmentReady(): Promise<boolean> {
  if (LinuxRunnerModule?.isEnvironmentReady) {
    try {
      return await LinuxRunnerModule.isEnvironmentReady();
    } catch (_) {
      return false;
    }
  }
  return false;
}

export async function initializeEnvironment(): Promise<boolean> {
  if (LinuxRunnerModule?.initializeEnvironment) {
    try {
      return await LinuxRunnerModule.initializeEnvironment();
    } catch (_) {
      return false;
    }
  }
  return true;
}

export async function executeCommand(
  command: string,
  workspaceId?: string
): Promise<ExecutionResult> {
  if (LinuxRunnerModule?.executeCommand) {
    try {
      return await LinuxRunnerModule.executeCommand(command, workspaceId ?? null);
    } catch (e: any) {
      return { stdout: `Error executing command: ${e.message}`, exitCode: -1 };
    }
  }
  return { stdout: `[LinuxRunner Fallback] Simulated execution: ${command}`, exitCode: 0 };
}

export async function executeCommandStream(
  commandId: string,
  command: string,
  workspaceId?: string
): Promise<ExecutionResult> {
  if (LinuxRunnerModule?.executeCommandStream) {
    try {
      return await LinuxRunnerModule.executeCommandStream(commandId, command, workspaceId ?? null);
    } catch (e: any) {
      return { stdout: `Error executing command stream: ${e.message}`, exitCode: -1 };
    }
  }
  return executeCommand(command, workspaceId);
}

export function stopCommand(commandId: string): boolean {
  if (LinuxRunnerModule?.stopCommand) {
    try {
      return LinuxRunnerModule.stopCommand(commandId);
    } catch (e) {
      console.warn("Failed to stop command", e);
    }
  }
  return false;
}

export function stopAllCommands(): boolean {
  if (LinuxRunnerModule?.stopAllCommands) {
    try {
      return LinuxRunnerModule.stopAllCommands();
    } catch (e) {
      console.warn("Failed to stop all commands", e);
    }
  }
  return false;
}

export async function startTerminalSession(
  sessionId: string,
  workspaceId?: string
): Promise<void> {
  if (LinuxRunnerModule?.startTerminalSession) {
    try {
      await LinuxRunnerModule.startTerminalSession(sessionId, workspaceId ?? null);
    } catch (e) {
      console.warn("Failed to start native terminal session", e);
    }
  }
}

export function writeTerminalInput(sessionId: string, data: string): void {
  if (LinuxRunnerModule?.writeTerminalInput) {
    try {
      LinuxRunnerModule.writeTerminalInput(sessionId, data);
    } catch (e) {
      console.warn("Failed to write terminal input", e);
    }
  }
}

export async function getSessionHistory(sessionId: string): Promise<string> {
  if (LinuxRunnerModule?.getSessionHistory) {
    try {
      return (await LinuxRunnerModule.getSessionHistory(sessionId)) || "";
    } catch (_) {
      return "";
    }
  }
  return "";
}

export async function listActiveSessions(): Promise<string[]> {
  if (LinuxRunnerModule?.listActiveSessions) {
    try {
      return (await LinuxRunnerModule.listActiveSessions()) || [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

export async function stopTerminalSession(sessionId: string): Promise<void> {
  if (LinuxRunnerModule?.stopTerminalSession) {
    try {
      await LinuxRunnerModule.stopTerminalSession(sessionId);
    } catch (e) {
      console.warn("Failed to stop terminal session", e);
    }
  }
}

export async function startPtySession(
  sessionId: string,
  workspaceId?: string,
  rows?: number,
  cols?: number
): Promise<void> {
  if (LinuxRunnerModule?.startPtySession) {
    try {
      await LinuxRunnerModule.startPtySession(sessionId, workspaceId ?? null, rows ?? 24, cols ?? 80);
    } catch (e) {
      console.warn("Failed to start PTY terminal session", e);
    }
  }
}

export function resizeTerminalSession(sessionId: string, cols: number, rows: number): boolean {
  if (LinuxRunnerModule?.resizeTerminalSession) {
    try {
      return LinuxRunnerModule.resizeTerminalSession(sessionId, cols, rows) || false;
    } catch (e) {
      console.warn("Failed to resize terminal session", e);
    }
  }
  return false;
}

export function addTerminalExitListener(
  sessionId: string,
  listener: (exitCode: number) => void
): { remove: () => void } {
  if (LinuxRunnerModule) {
    const sub = emitter.addListener("onTerminalExit", (event: { sessionId: string; exitCode: number }) => {
      if (event && event.sessionId === sessionId && typeof event.exitCode === "number") {
        listener(event.exitCode);
      }
    });
    return sub;
  }
  return {
    remove: () => {},
  };
}

export function addTerminalDataListener(
  sessionId: string,
  listener: (data: string) => void
): { remove: () => void } {
  if (LinuxRunnerModule) {
    const sub = emitter.addListener("onTerminalData", (event: { sessionId: string; data: string }) => {
      if (event && event.sessionId === sessionId && typeof event.data === "string") {
        listener(event.data);
      }
    });
    return sub;
  }
  // Fallback mock listener for web / Expo Go simulation
  const timer = setTimeout(() => {
    listener("\r\nastra:/workspace# ");
  }, 100);
  return {
    remove: () => clearTimeout(timer),
  };
}

export function addCommandOutputListener(
  commandId: string,
  listener: (line: string) => void
): { remove: () => void } {
  if (LinuxRunnerModule) {
    const sub = emitter.addListener("onCommandOutput", (event: { commandId: string; line: string }) => {
      if (event && event.commandId === commandId && typeof event.line === "string") {
        listener(event.line);
      }
    });
    return sub;
  }
  return {
    remove: () => {},
  };
}

// High-level utility helpers
export async function installPackages(
  packages: string[],
  workspaceId?: string
): Promise<ExecutionResult> {
  return executeCommand(`DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ${packages.join(" ")}`, workspaceId);
}

export async function runArtisan(
  projectPath: string,
  args: string[]
): Promise<ExecutionResult> {
  return executeCommand(`cd /workspace/${projectPath} && php artisan ${args.join(" ")}`);
}

export function copyToClipboard(text: string): boolean {
  if (LinuxRunnerModule?.copyToClipboard) {
    try {
      return LinuxRunnerModule.copyToClipboard(text);
    } catch (_) {
      return false;
    }
  }
  return false;
}

export function getStringFromClipboard(): string {
  if (LinuxRunnerModule?.getStringFromClipboard) {
    try {
      return LinuxRunnerModule.getStringFromClipboard();
    } catch (_) {
      return "";
    }
  }
  return "";
}


export function isIgnoringBatteryOptimizations(): boolean {
  if (LinuxRunnerModule?.isIgnoringBatteryOptimizations) {
    try {
      return LinuxRunnerModule.isIgnoringBatteryOptimizations();
    } catch (_) {
      return true;
    }
  }
  return true;
}

export async function requestIgnoreBatteryOptimizations(): Promise<boolean> {
  if (LinuxRunnerModule?.requestIgnoreBatteryOptimizations) {
    try {
      return await LinuxRunnerModule.requestIgnoreBatteryOptimizations();
    } catch (_) {
      return false;
    }
  }
  return false;
}

export async function openBatteryOptimizationSettings(): Promise<boolean> {
  if (LinuxRunnerModule?.openBatteryOptimizationSettings) {
    try {
      return await LinuxRunnerModule.openBatteryOptimizationSettings();
    } catch (_) {
      return false;
    }
  }
  return false;
}

export async function openAppDetailsSettings(): Promise<boolean> {
  if (LinuxRunnerModule?.openAppDetailsSettings) {
    try {
      return await LinuxRunnerModule.openAppDetailsSettings();
    } catch (_) {
      return false;
    }
  }
  return false;
}

export * from "./fileSystem";
export * from "./provisioning";
export { LinuxRunnerModule };


