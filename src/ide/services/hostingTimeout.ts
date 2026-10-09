/**
 * A hard wall-clock bound for ONE guest invocation, enforced on the JS side.
 *
 * WHY THIS EXISTS: every guest call is an expo-modules-core AsyncFunction, and
 * ALL of them run on ONE background thread — AppContext.modulesQueue, a single
 * HandlerThread named "expo.modules.AsyncFunctionQueue" (see
 * expo-modules-core AppContext.kt / AsyncFunctionComponent.dispatchOnQueue).
 * ProcessExecutor.execute() calls `process.waitFor()` with NO timeout (the
 * module passes timeoutSeconds = 0), so one PRoot invocation that never returns
 * — the server-launch command, whose proot stays alive because it is still
 * tracing the detached, long-lived server — parks that thread forever. Awaited
 * directly, the hosting flow then sits on `working` indefinitely: waitForPort's
 * own bound is never reached, because its loop is stuck on ONE await that never
 * settles (and the next call is queued behind the parked thread and never even
 * starts).
 *
 * This race abandons a promise that never settles, tags the result TIMED OUT,
 * and lets the caller treat it as a failed tick. The abandoned native call
 * cannot be cancelled from JS, but the run ALWAYS advances to its next step and
 * its visible error, on a provable schedule.
 */

/** How long one guest call may run before the JS side abandons it. */
export const GUEST_TIMEOUT_MS = 30_000;

/** The runner shape: one command in, one result out; must never reject. */
export type RawGuestExecute = (command: string) => Promise<{ code: number; out: string }>;

export interface BoundedResult {
  /** Process exit code when it settled (-1 when the bound elapsed). */
  code: number;
  /** Combined stdout/stderr captured by the guest ("" on timeout). */
  out: string;
  /** true when the wall-clock bound elapsed and the promise was abandoned. */
  timedOut: boolean;
  /** Wall time actually spent waiting, in ms. */
  ms: number;
}

/**
 * Race one guest call against a wall-clock bound. Always resolves, never
 * rejects: the loser (a promise that may never settle) is abandoned, and the
 * timer is cleared on settle so no interval is leaked.
 */
export function runBounded(
  execute: RawGuestExecute,
  command: string,
  timeoutMs: number = GUEST_TIMEOUT_MS
): Promise<BoundedResult> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<BoundedResult>((resolve) => {
    timer = setTimeout(
      () => resolve({ code: -1, out: "", timedOut: true, ms: Date.now() - started }),
      timeoutMs
    );
  });
  const call = (async (): Promise<BoundedResult> => {
    try {
      const r = await execute(command);
      return { code: r.code, out: r.out, timedOut: false, ms: Date.now() - started };
    } catch (e: any) {
      return { code: 1, out: String(e?.message || e || ""), timedOut: false, ms: Date.now() - started };
    }
  })();
  return Promise.race([call, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
