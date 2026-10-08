import { executeCommand, installPackages } from "../../../modules/linux-runner/src";
import { DevTool, DEV_CATEGORIES, probeTargets } from "./devCategories";

/**
 * Guest plumbing for the Dependencies screen.
 *
 * This file adds NO new installer and NO new download path: it calls the exact
 * two helpers the rest of the app already uses —
 *   - executeCommand()  for a single `command -v` / `dpkg-query` probe
 *   - installPackages() for the real apt install (the same one behind
 *     Settings -> Linux -> Optional Extras)
 * — and nothing runs until the screen calls installDependency() for one tap.
 */

export interface InstalledState {
  /** tool.id -> installed. Only ids the guest actually answered for appear. */
  tools: Record<string, boolean>;
}

/** The tools that carry a probe target (a binary or a header-only package). */
const PROBE_TOOLS: DevTool[] = DEV_CATEGORIES.flatMap((c) =>
  c.tools.filter((t) => !!t.bin || !!t.probeApt)
);

/**
 * Probe every tool's binary (`command -v`) and header-only package
 * (`dpkg-query -W`) in ONE guest round-trip, keyed back to tool ids.
 */
export async function probeDependencyState(): Promise<InstalledState> {
  const { bins, apts } = probeTargets();
  const parts: string[] = [];
  if (bins.length > 0) {
    parts.push(
      `for b in ${bins.join(" ")}; do if command -v "$b" >/dev/null 2>&1; then echo "bin:$b:yes"; else echo "bin:$b:no"; fi; done`
    );
  }
  if (apts.length > 0) {
    parts.push(
      `for p in ${apts.join(" ")}; do if dpkg-query -W -f='\${Status}' "$p" 2>/dev/null | grep -q "ok installed"; then echo "apt:$p:yes"; else echo "apt:$p:no"; fi; done`
    );
  }
  const tools: Record<string, boolean> = {};
  if (parts.length === 0) return { tools };

  try {
    const res = await executeCommand(parts.join("; "));
    const binState: Record<string, boolean> = {};
    const aptState: Record<string, boolean> = {};
    for (const line of (res.stdout || "").split("\n")) {
      const m = line.trim().match(/^(bin|apt):(\S+):(yes|no)$/);
      if (!m) continue;
      if (m[1] === "bin") binState[m[2]] = m[3] === "yes";
      else aptState[m[2]] = m[3] === "yes";
    }
    for (const tool of PROBE_TOOLS) {
      if (tool.probeApt) {
        if (tool.probeApt in aptState) tools[tool.id] = aptState[tool.probeApt];
      } else if (tool.bin && tool.bin in binState) {
        tools[tool.id] = binState[tool.bin];
      }
    }
  } catch (_) {
    // Guest unavailable: return empty so the UI shows "not checked yet".
  }
  return { tools };
}

/**
 * Install one tool with the existing apt installer. Returns ok=false (without
 * throwing) for tools the app cannot install — the caller shows the manual
 * hint and never pretends an install happened.
 */
export async function installDependency(
  tool: DevTool
): Promise<{ ok: boolean; output: string }> {
  if (tool.install.kind !== "apt") {
    return {
      ok: false,
      output:
        tool.install.kind === "manual"
          ? tool.install.hint
          : "This is included with the app — nothing to install.",
    };
  }
  try {
    const res = await installPackages(tool.install.apt);
    return { ok: res.exitCode === 0, output: res.stdout || "" };
  } catch (e: any) {
    return { ok: false, output: e?.message || "Install failed." };
  }
}
