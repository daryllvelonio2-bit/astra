import { requireNativeModule, EventEmitter } from "expo-modules-core";

let LinuxRunnerModule: any = null;
try {
  LinuxRunnerModule = requireNativeModule("LinuxRunner");
} catch (_) {
  LinuxRunnerModule = null;
}

const emitter: any = new EventEmitter(LinuxRunnerModule ?? {});

export interface ProvisioningStatus {
  isProvisioning: boolean;
  stageName: string;
  stageIndex: number;
  totalStages: number;
  attempt: number;
  maxRetries: number;
  currentPackage: string;
  lastOutput: string;
  isComplete: boolean;
  hasError: boolean;
  errorMessage?: string;
  nodeExists?: boolean;
  gitExists?: boolean;
  pythonExists?: boolean;
  arch?: string;
}

export const DEFAULT_PROVISIONING_STATUS: ProvisioningStatus = {
  isProvisioning: false,
  stageName: "Idle",
  stageIndex: 0,
  totalStages: 4,
  attempt: 0,
  maxRetries: 0,
  currentPackage: "",
  lastOutput: "",
  isComplete: false,
  hasError: false,
  errorMessage: "",
  nodeExists: false,
  gitExists: false,
  pythonExists: false,
  arch: "arm64-v8a",
};

export function getProvisioningStatus(): ProvisioningStatus {
  if (LinuxRunnerModule?.getProvisioningStatus) {
    try {
      const res = LinuxRunnerModule.getProvisioningStatus();
      if (res && typeof res === "object") {
        return {
          isProvisioning: !!res.isProvisioning,
          stageName: String(res.stageName || "Idle"),
          stageIndex: Number(res.stageIndex || 0),
          totalStages: Number(res.totalStages || 4),
          attempt: Number(res.attempt || 0),
          maxRetries: Number(res.maxRetries || 0),
          currentPackage: String(res.currentPackage || ""),
          lastOutput: String(res.lastOutput || ""),
          isComplete: !!res.isComplete,
          hasError: !!res.hasError,
          errorMessage: res.errorMessage ? String(res.errorMessage) : undefined,
          nodeExists: !!res.nodeExists,
          gitExists: !!res.gitExists,
          pythonExists: !!res.pythonExists,
          arch: String(res.arch || "arm64-v8a"),
        };
      }
    } catch (_) {}
  }
  return DEFAULT_PROVISIONING_STATUS;
}

export function cancelProvisioning(): boolean {
  if (LinuxRunnerModule?.cancelProvisioning) {
    try {
      return !!LinuxRunnerModule.cancelProvisioning();
    } catch (_) {}
  }
  return false;
}

export async function startProvisioning(): Promise<boolean> {
  if (LinuxRunnerModule?.startProvisioning) {
    try {
      return await LinuxRunnerModule.startProvisioning();
    } catch (_) {}
  }
  return false;
}

/** User choice: auto-download the base toolchain (default false). */
export function isAutoProvisionEnabled(): boolean {
  if (LinuxRunnerModule?.isAutoProvisionEnabled) {
    try {
      return !!LinuxRunnerModule.isAutoProvisionEnabled();
    } catch (_) {}
  }
  return false;
}

export function setAutoProvisionEnabled(enabled: boolean): boolean {
  if (LinuxRunnerModule?.setAutoProvisionEnabled) {
    try {
      return !!LinuxRunnerModule.setAutoProvisionEnabled(enabled);
    } catch (_) {}
  }
  return false;
}

export function addProvisioningListener(
  listener: (status: ProvisioningStatus) => void
): { remove: () => void } {
  if (LinuxRunnerModule) {
    const sub = emitter.addListener("onProvisioningProgress", (event: any) => {
      if (event && typeof event === "object") {
        listener({
          isProvisioning: !!event.isProvisioning,
          stageName: String(event.stageName || ""),
          stageIndex: Number(event.stageIndex || 0),
          totalStages: Number(event.totalStages || 4),
          attempt: Number(event.attempt || 0),
          maxRetries: Number(event.maxRetries || 0),
          currentPackage: String(event.currentPackage || ""),
          lastOutput: String(event.lastOutput || ""),
          isComplete: !!event.isComplete,
          hasError: !!event.hasError,
          errorMessage: event.errorMessage ? String(event.errorMessage) : undefined,
        });
      }
    });
    return sub;
  }
  return {
    remove: () => {},
  };
}
