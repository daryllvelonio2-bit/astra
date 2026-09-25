import { ExtensionMarketplaceItem } from "./types";
import { showAppDialog } from "../appDialog";
import { installExtension, loadExtensionRegistry } from "./extensionRegistry";
import {
  resolveRuntimeForExtension,
  installGlobalRuntime,
  isRuntimeBinaryInstalled,
} from "./extensionRuntimeService";

export interface ExtensionInstallJob {
  id: string;
  displayName: string;
  percent: number;
  status: string;
  error?: string;
  done?: boolean;
}

const activeJobs = new Map<string, ExtensionInstallJob>();
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) {
    try {
      fn();
    } catch (_) {}
  }
}

export function subscribeExtensionInstall(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function getExtensionInstallJob(id: string): ExtensionInstallJob | undefined {
  return activeJobs.get(id);
}

export function isExtensionInstalling(id: string): boolean {
  const job = activeJobs.get(id);
  return Boolean(job && !job.done && !job.error);
}

export function getActiveInstallJobs(): ExtensionInstallJob[] {
  return Array.from(activeJobs.values()).filter((j) => !j.done);
}

/**
 * Starts an extension download and installation in the background.
 * Runs independently of modal visibility or component lifecycles.
 */
export async function startExtensionInstall(
  item: ExtensionMarketplaceItem,
  onComplete?: (success: boolean) => void
): Promise<boolean> {
  if (isExtensionInstalling(item.id)) {
    return false;
  }

  const job: ExtensionInstallJob = {
    id: item.id,
    displayName: item.displayName || item.name,
    percent: 10,
    status: "Downloading package...",
  };

  activeJobs.set(item.id, job);
  notify();

  try {
    // Download and extract declarative assets (themes, snippets, languages)
    await installExtension(item, (percent, status) => {
      const current = activeJobs.get(item.id);
      if (current) {
        current.percent = Math.min(Math.max(percent, 10), 90);
        current.status = status;
        notify();
      }
    });

    // Check if the extension requires a global system toolchain (e.g. Java OpenJDK)
    const runtime = resolveRuntimeForExtension(item);
    if (runtime) {
      const isInstalled = await isRuntimeBinaryInstalled(runtime.binary);
      if (!isInstalled) {
        job.status = `Installing global ${runtime.name}...`;
        job.percent = 85;
        notify();
        await installGlobalRuntime(runtime, (statusMsg) => {
          job.status = statusMsg;
          notify();
        });
      }
    }

    // Update extension registry
    await loadExtensionRegistry();

    job.percent = 100;
    job.status = "Installed & Active";
    job.done = true;
    notify();

    setTimeout(() => {
      activeJobs.delete(item.id);
      notify();
    }, 2500);

    showAppDialog({ title: runtime ? "Toolchain & Extension Ready" : "Extension Installed", message: runtime
        ? `${job.displayName} and ${runtime.name} are ready! The '${runtime.binary}' toolchain is now globally available in the terminal and editor runner.`
        : `${job.displayName} is installed! Its themes, snippets, and tools are now active in Astra.` });

    onComplete?.(true);
    return true;
  } catch (err: any) {
    job.error = err?.message || "Failed to install extension";
    job.status = "Installation failed";
    notify();

    showAppDialog({ title: "Installation Failed", message: err?.message || `Could not install ${job.displayName}.` });
    setTimeout(() => {
      activeJobs.delete(item.id);
      notify();
    }, 4000);

    onComplete?.(false);
    return false;
  }
}
