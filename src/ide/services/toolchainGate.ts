import {
  getProvisioningStatus,
  startProvisioning,
  addProvisioningListener,
  ProvisioningStatus,
} from "../../../modules/linux-runner/src";
import { executeCommand } from "../../../modules/linux-runner/src";

/**
 * Toolchain gate: blocks git-dependent UI (Git tab, clone entry points)
 * until the guest toolchain is fully provisioned. `isComplete` is derived
 * natively from the stage marker + node/git/python binaries on disk, so it
 * is reliable across app restarts (not just in the process that downloaded).
 *
 * While provisioning RUNS the gate reports blocked with a live message —
 * apt holds its lock then, so parallel installs would fail anyway.
 *
 * isComplete does NOT guarantee the CA bundle exists (stage 1 lists
 * ca-certificates, but per-package failures are non-fatal), so the gate
 * also probes the git essentials and can one-tap install them.
 */

export interface GateStatus {
  /** True when the toolchain is provisioned (git operations may proceed). */
  ready: boolean;
  /** True while the background toolchain download is running. */
  provisioning: boolean;
  /** 0-100 progress while provisioning. */
  pct: number;
  /** Human message for a blocked gate (why git UI is hidden). */
  message: string;
  /** True once a probe confirmed the git essentials are installed. */
  gitEssentialsReady: boolean;
  /** True once the first status/probe pass ran (UI can trust the verdict). */
  settled: boolean;
}

const BLOCKED_MESSAGE =
  "The Linux toolchain has not been downloaded yet. Git needs git, TLS certificates and SSH from the toolchain to reach GitHub.";

const state: GateStatus = {
  ready: false,
  provisioning: false,
  pct: 0,
  message: "",
  gitEssentialsReady: false,
  settled: false,
};

// Listeners receive fresh SNAPSHOTS (state is mutated in place — passing the
// same reference would make React bail out of every re-render).
const listeners = new Set<(s: GateStatus) => void>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let probing = false;

function emit() {
  const snapshot = { ...state };
  for (const l of listeners) l(snapshot);
}

function applyStatus(status: ProvisioningStatus) {
  const pct = status.totalStages > 0 ? Math.round((status.stageIndex / status.totalStages) * 100) : 0;
  const message = status.isComplete
    ? ""
    : status.isProvisioning
    ? `Downloading toolchain — ${status.stageName || "working"}… (${status.currentPackage || "preparing"})`
    : BLOCKED_MESSAGE;
  // Emit only on visible change: the poll runs every 3s and subscribers are
  // live React components — steady-state must be re-render-free.
  const changed =
    state.ready !== status.isComplete ||
    state.provisioning !== status.isProvisioning ||
    state.pct !== pct ||
    state.message !== message;
  state.ready = status.isComplete;
  state.provisioning = status.isProvisioning;
  state.pct = pct;
  state.message = message;
  if (!state.ready) state.settled = true; // blocked verdict needs no probe
  if (changed) emit();
}

/**
 * Probe the guest for the git essentials (cheap, one command). Complements
 * isComplete: a stage can finish with a per-package failure, so binaries
 * alone are not proof that git/TLS actually work.
 */
async function probeGitEssentials(): Promise<void> {
  // Probe until the first confirmation only — then steady state costs zero
  // bridge calls. (Blocked gates never reach here.)
  if (probing || !state.ready || state.gitEssentialsReady) return;
  probing = true;
  try {
    const res = await executeCommand(
      "command -v git >/dev/null && test -s /etc/ssl/certs/ca-certificates.crt && echo OK || echo MISSING"
    );
    const ok = (res.stdout || "").includes("OK");
    state.settled = true;
    if (ok !== state.gitEssentialsReady) {
      state.gitEssentialsReady = ok;
      if (!ok) state.message = "Git tools are incomplete (missing git or TLS certificates). Install them below.";
      emit();
    }
  } catch (_) {
    // Guest unavailable: leave the last known state.
  } finally {
    probing = false;
  }
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    applyStatus(getProvisioningStatus());
    void probeGitEssentials();
  }, 3000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/** Subscribe to gate changes; polls native status + essentials while subscribed. */
export function subscribeToolchainGate(cb: (s: GateStatus) => void): () => void {
  listeners.add(cb);
  if (listeners.size === 1) {
    applyStatus(getProvisioningStatus());
    void probeGitEssentials();
    startPolling();
    const sub = addProvisioningListener((status) => applyStatus(status));
    (listeners as any).__sub = sub;
  }
  cb({ ...state });
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) {
      const sub = (listeners as any).__sub;
      try {
        sub?.remove?.();
      } catch (_) {}
      (listeners as any).__sub = null;
      stopPolling();
    }
  };
}

export function getToolchainGateSnapshot(): GateStatus {
  return { ...state };
}

/** Kick off (or resume) the toolchain download from a gate screen. */
export async function startToolchainDownload(): Promise<boolean> {
  try {
    return await startProvisioning();
  } catch (_) {
    return false;
  }
}

/**
 * One-shot gate check for command paths outside React (clone/push/pull).
 * Verifies natively reported completeness AND a live git-essentials probe.
 */
export async function isToolchainReadyForGit(): Promise<{ ok: boolean }> {
  const status = getProvisioningStatus();
  if (!status.isComplete) return { ok: false };
  try {
    const res = await executeCommand(
      "command -v git >/dev/null && test -s /etc/ssl/certs/ca-certificates.crt && echo OK || echo MISSING"
    );
    return { ok: (res.stdout || "").includes("OK") };
  } catch (_) {
    return { ok: false };
  }
}

/** One-tap install of exactly what git needs (never the whole toolchain). */
export async function installGitEssentials(): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await executeCommand(
      "apt-get update -qq && apt-get install -y -qq git ca-certificates openssh-client >/dev/null 2>&1 && update-ca-certificates >/dev/null 2>&1; command -v git >/dev/null && test -s /etc/ssl/certs/ca-certificates.crt && echo GATE_OK || echo GATE_FAIL"
    );
    const ok = (res.stdout || "").includes("GATE_OK");
    if (ok) {
      state.gitEssentialsReady = true;
      state.message = "";
      emit();
      return { ok: true };
    }
    return { ok: false, error: (res.stdout || "").trim() || "Install failed — check Settings → Linux for the full log." };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Install failed." };
  }
}
