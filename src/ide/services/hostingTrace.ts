/**
 * The on-device trace for the readiness step: /sdcard/astra-probe.txt.
 *
 * Pull it from a desktop with:   adb pull /sdcard/astra-probe.txt
 *
 * WHY ITS OWN MODULE: the hosting flow can only be diagnosed on the phone
 * (a chroot harness cannot reproduce a PRoot-only hang), so every guest attempt
 * is mirrored to shared storage. ONE record per attempt, appended, and the file
 * is trimmed to its last ~60 lines so it stays pullable and readable.
 *
 * WHY THE WRITE CANNOT HANG OR BREAK THE RUN: the native readFile/writeFile
 * helpers are SYNCHRONOUS local-file functions — they are not guest calls, so a
 * jammed/absent guest cannot block them — and every step is wrapped so a failed
 * write (e.g. the app lacks All-Files access) is swallowed. recordProbe() never
 * throws and never returns a promise.
 */
import { readFileNative, writeFileNative } from "../../../modules/linux-runner/src";

/** The file the user's desktop pulls with `adb pull`. */
export const PROBE_TRACE_PATH = "/sdcard/astra-probe.txt";
/** Cap: only the last N lines survive; older records roll off. */
export const PROBE_TRACE_MAX_LINES = 400;

const HEADER = [
  "# astra probe trace — one block per hosting guest attempt (last 60 lines kept)",
  "# <utc> VERDICT | cmd:<exact command> | out:<stdout/stderr tail> | log:<server log exists + last 3> | listen:</proc LISTEN>",
];

export interface ProbeRecord {
  /** The exact command text sent to the guest. */
  command: string;
  /** Did the JS-side bound elapse (the promise never settled)? */
  timedOut: boolean;
  /** Exit code when it settled. */
  code: number;
  /** Combined stdout/stderr captured for this attempt. */
  out: string;
}

/** The diagnostic block the readiness probe appends to its own output. */
export interface ProbeDiag {
  logExists: boolean | null;
  logTail: string[];
  listening: boolean | null;
}

/** Parse the DIAG_* lines the readiness probe emits (absent on other commands). */
export function parseProbeDiag(out: string): ProbeDiag {
  const lines = (out || "").split("\n").map((l) => l.trimEnd());
  const logLine = lines.find((l) => l.startsWith("DIAG_LOG:"));
  const logTail: string[] = [];
  for (const l of lines) if (l.startsWith("DIAG_L:")) logTail.push(l.slice(7).slice(0, 100));
  const listenLine = lines.find((l) => l.startsWith("DIAG_LISTEN:"));
  return {
    logExists: logLine ? logLine.endsWith("EXISTS") : null,
    logTail: logTail.slice(-3),
    listening: listenLine ? listenLine.endsWith("YES") : null,
  };
}

/** Last `n` non-DIAG lines of a command's output, for the record's tail. */
function outTail(out: string, n = 2): string[] {
  return (out || "")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l && !l.startsWith("DIAG_"))
    .slice(-n);
}

/**
 * Append ONE attempt to the device trace. Synchronous, never throws, never
 * awaits a guest call, and trims to PROBE_TRACE_MAX_LINES.
 */
export function recordProbe(p: ProbeRecord): void {
  try {
    const d = parseProbeDiag(p.out);
    const verdict = p.timedOut ? "TIMED OUT" : `SETTLED exit ${p.code}`;
    const cmd = (p.command || "").replace(/\s+/g, " ").trim().slice(0, 90);
    const logField =
      d.logExists === null
        ? "not sampled (no probe result — guest did not answer)"
        : (d.logExists ? "exists" : "missing") +
          (d.logTail.length ? " | " + d.logTail.join(" | ").slice(0, 200) : "");
    const block = [
      `${new Date().toISOString()}  ${verdict}`,
      `cmd: ${cmd}`,
      ...outTail(p.out).map((l) => `out: ${l.slice(0, 110)}`),
      `log: ${logField}`,
      `listen: ${d.listening === null ? "not sampled" : d.listening ? "YES (LISTEN on port)" : "no"}`,
    ];
    const prev = readFileNative(PROBE_TRACE_PATH) || "";
    const prevLines = prev ? prev.split("\n") : HEADER;
    const merged = prevLines.concat(block).filter((l, i, a) => !(i === 0 && l === ""));
    const kept = merged.slice(-PROBE_TRACE_MAX_LINES).join("\n");
    writeFileNative(PROBE_TRACE_PATH, kept.endsWith("\n") ? kept : kept + "\n");
  } catch (_) {
    // A trace that cannot be written must never disturb the run.
  }
}
