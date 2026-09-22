import { requireNativeModule } from 'expo-modules-core';

let LinuxRunnerModule: any = null;
try {
  LinuxRunnerModule = requireNativeModule('LinuxRunner');
} catch (_) {
  LinuxRunnerModule = null;
}

/**
 * Host-side tree kill (ProcessTreeKiller): accurate PPIDs from /proc/stat,
 * TERM leaves-first then KILL survivors, own UID only. No proot spawn, no
 * guest `ps` parsing — milliseconds instead of seconds per tree.
 * Returns kill count, 0 when native is unavailable (Expo Go) or on failure.
 */
export async function killProcessTreeNative(pid: number): Promise<number> {
  try {
    if (LinuxRunnerModule?.killProcessTree && pid > 0) {
      const n = await LinuxRunnerModule.killProcessTree(Math.floor(pid));
      return typeof n === "number" ? n : 0;
    }
  } catch (_) {}
  return 0;
}

/**
 * Host-side pattern kill (see killProcessTreeNative). Matches own-UID
 * /proc cmdlines, skips the app/agent processes. Returns kill count.
 */
export async function killByPatternNative(pattern: string): Promise<number> {
  try {
    if (LinuxRunnerModule?.killByPattern && pattern && pattern.length >= 3) {
      const n = await LinuxRunnerModule.killByPattern(pattern);
      return typeof n === "number" ? n : 0;
    }
  } catch (_) {}
  return 0;
}
