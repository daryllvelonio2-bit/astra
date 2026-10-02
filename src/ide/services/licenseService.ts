import * as FileSystem from "expo-file-system/legacy";
import { getFileInfo, makeDir, readFileText, writeFileText } from "./nativeFs";

/**
 * Astra trial licensing.
 *
 * The first-launch stamp is kept in TWO independent places:
 *   1. an app-private record (`.license.json`), separate from config.json so
 *      "reset settings" cannot reset the trial;
 *   2. a marker on shared storage (`/sdcard/.astra/.license`), which survives
 *      "clear app data" and normally a reinstall too.
 *
 * Reads MERGE every surviving copy — earliest `startedAt` wins, highest
 * `lastSeenMax` wins — and `expiresAt` is always DERIVED as `startedAt +
 * TRIAL_DAYS` instead of trusted from disk, so editing the expiry forward does
 * nothing. Deleting one copy therefore just lets the other restore the original
 * trial on next launch.
 *
 * A monotonic `lastSeenMax` high-water mark turns a wound-back device clock
 * into `expiredReason: "clock-tampering"`.
 *
 * Remaining limits (by design, not bugs): shared storage is world-writable, so
 * a user with a file manager can delete BOTH markers, and the bundled Debian
 * shell runs as the same UID so it can reach them too. Real enforcement needs a
 * server-signed expiry; see PROGRESS.md.
 */

export const TRIAL_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A clock that goes back further than this is treated as tampering. */
const CLOCK_ROLLBACK_TOLERANCE_MS = 6 * 60 * 60 * 1000;

/**
 * How long a computed state may be reused. The memo must NEVER outlive the
 * answer it describes — otherwise a session left open across the deadline keeps
 * serving a stale "active" — so the effective lifetime is always
 * `min(expiresAt, now + CACHE_TTL_MS)`.
 */
const CACHE_TTL_MS = 60 * 1000;

/** Primary app-private record. */
const PRIVATE_FILE = `${FileSystem.documentDirectory || ""}.license.json`;
/** Secondary marker on shared storage — outlives a "clear app data". */
const SHARED_DIR = "/sdcard/.astra";
const SHARED_FILE = `${SHARED_DIR}/.license`;
const ALL_FILES = [PRIVATE_FILE, SHARED_FILE];

export type TrialStatus = "active" | "expired";
export type ExpiredReason = "trial-ended" | "clock-tampering";

export interface LicenseState {
  status: TrialStatus;
  /** Epoch ms of the very first launch. */
  startedAt: number;
  /** Epoch ms the trial runs out (`startedAt + TRIAL_DAYS`). */
  expiresAt: number;
  /** Whole days remaining (0 once expired). */
  daysLeft: number;
  /** Whole hours remaining inside the last day (0 otherwise / once expired). */
  hoursLeft: number;
  msLeft: number;
  expiredReason: ExpiredReason | null;
  /** Owner override — bypasses expiry entirely. */
  unlocked: boolean;
}

interface LicenseRecord {
  startedAt: number;
  expiresAt: number;
  lastSeenMax: number;
  unlocked: boolean;
}

let cached: LicenseState | null = null;
/** Wall-clock ms until which `cached` may still be served. */
let cachedValidUntil = 0;
let accessQueue: Promise<unknown> = Promise.resolve();

/** Serialise every read-modify-write so concurrent callers can't clobber. */
function withLock<T>(task: () => Promise<T>): Promise<T> {
  const run = accessQueue.then(task, task);
  accessQueue = run.catch(() => undefined);
  return run;
}

/** When a record's answer stops being reusable. */
function validUntilFor(record: LicenseRecord, now: number): number {
  if (record.unlocked) return Number.MAX_SAFE_INTEGER;
  return Math.min(record.expiresAt, now + CACHE_TTL_MS);
}

function parseRecord(raw: string): LicenseRecord | null {
  try {
    const parsed = JSON.parse(raw) as Partial<LicenseRecord>;
    if (!parsed || typeof parsed.startedAt !== "number") return null;
    return {
      startedAt: parsed.startedAt,
      // Derived on read; a hand-edited expiry is ignored (see module header).
      expiresAt: parsed.startedAt + TRIAL_DAYS * DAY_MS,
      lastSeenMax: typeof parsed.lastSeenMax === "number" ? parsed.lastSeenMax : parsed.startedAt,
      unlocked: !!parsed.unlocked,
    };
  } catch {
    return null;
  }
}

async function readOne(path: string): Promise<LicenseRecord | null> {
  try {
    const info = await getFileInfo(path);
    if (!info.exists) return null;
    return parseRecord(await readFileText(path));
  } catch {
    // A missing/unreadable copy is normal (fresh install, locked storage).
    return null;
  }
}

/** Merge every surviving copy: earliest start, highest high-water mark. */
async function readRecord(): Promise<{ record: LicenseRecord | null; copies: number }> {
  const found = (await Promise.all(ALL_FILES.map(readOne))).filter(
    (r): r is LicenseRecord => !!r,
  );
  if (found.length === 0) return { record: null, copies: 0 };

  const startedAt = Math.min(...found.map((r) => r.startedAt));
  return {
    record: {
      startedAt,
      expiresAt: startedAt + TRIAL_DAYS * DAY_MS,
      lastSeenMax: Math.max(...found.map((r) => r.lastSeenMax)),
      unlocked: found.some((r) => r.unlocked),
    },
    copies: found.length,
  };
}

async function writeOne(path: string, record: LicenseRecord): Promise<void> {
  try {
    if (path === SHARED_FILE) await makeDir(SHARED_DIR);
    await writeFileText(path, JSON.stringify(record, null, 2));
  } catch (e) {
    // Best-effort: one unwritable location must not break the gate.
    console.error(`Failed to write license record to ${path}:`, e);
  }
}

async function writeRecord(record: LicenseRecord): Promise<void> {
  await Promise.all(ALL_FILES.map((path) => writeOne(path, record)));
}

function toState(record: LicenseRecord, now: number): LicenseState {
  const msLeft = Math.max(0, record.expiresAt - now);
  const tampered = now < record.lastSeenMax - CLOCK_ROLLBACK_TOLERANCE_MS;
  const ended = msLeft <= 0;
  const expired = tampered || ended;

  return {
    status: expired ? "expired" : "active",
    startedAt: record.startedAt,
    expiresAt: record.expiresAt,
    daysLeft: expired ? 0 : Math.floor(msLeft / DAY_MS),
    hoursLeft: expired ? 0 : Math.floor((msLeft % DAY_MS) / (60 * 60 * 1000)),
    msLeft: expired ? 0 : msLeft,
    expiredReason: !expired ? null : tampered ? "clock-tampering" : "trial-ended",
    unlocked: record.unlocked,
  };
}

/**
 * Current trial state. Creates the first-launch stamp when absent, advances the
 * monotonic clock guard, and re-syncs any copy that was deleted. Cheap to call
 * repeatedly — the memo expires with the trial (see `CACHE_TTL_MS`), so crossing
 * the deadline flips the result even if the session is never backgrounded.
 */
export async function getLicenseState(force = false): Promise<LicenseState> {
  if (cached && !force && Date.now() < cachedValidUntil) return cached;
  return withLock(async () => {
    if (cached && !force && Date.now() < cachedValidUntil) return cached;
    const now = Date.now();
    const { record: existing, copies } = await readRecord();

    let record: LicenseRecord;
    let dirty = false;
    if (!existing) {
      record = {
        startedAt: now,
        expiresAt: now + TRIAL_DAYS * DAY_MS,
        lastSeenMax: now,
        unlocked: false,
      };
      dirty = true;
    } else {
      record = existing;
      if (now > record.lastSeenMax) {
        // Advance the high-water mark so a later clock rollback is detectable.
        record.lastSeenMax = now;
        dirty = true;
      }
      // Restore a copy that was deleted in an attempt to reset the trial.
      if (copies < ALL_FILES.length) dirty = true;
    }
    if (dirty) await writeRecord(record);

    cached = toState(record, now);
    cachedValidUntil = validUntilFor(record, now);
    return cached;
  });
}

/** Fast synchronous read of the last computed state (null before first check). */
export function peekLicenseState(): LicenseState | null {
  return cached;
}

/** Owner override — bypasses expiry. Pass false to re-arm the trial check. */
export async function setTrialUnlocked(unlocked: boolean): Promise<LicenseState> {
  return withLock(async () => {
    const now = Date.now();
    const { record: existing } = await readRecord();
    const record: LicenseRecord = existing ?? {
      startedAt: now,
      expiresAt: now + TRIAL_DAYS * DAY_MS,
      lastSeenMax: now,
      unlocked: false,
    };
    record.unlocked = unlocked;
    record.expiresAt = record.startedAt + TRIAL_DAYS * DAY_MS;
    if (now > record.lastSeenMax) record.lastSeenMax = now;
    await writeRecord(record);
    cached = toState(record, now);
    cachedValidUntil = validUntilFor(record, now);
    return cached;
  });
}

/** Drop the memoised state so the next check re-reads disk. */
export function clearLicenseCache(): void {
  cached = null;
  cachedValidUntil = 0;
}

/** "6 days left" / "23 hours left" / "Trial ended". */
export function formatRemaining(state: LicenseState): string {
  if (state.status === "expired") return "Trial ended";
  if (state.daysLeft > 0) {
    return `${state.daysLeft} day${state.daysLeft === 1 ? "" : "s"} left`;
  }
  if (state.hoursLeft > 0) {
    return `${state.hoursLeft} hour${state.hoursLeft === 1 ? "" : "s"} left`;
  }
  return "Less than an hour left";
}
