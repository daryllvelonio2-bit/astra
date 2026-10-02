import * as FileSystem from "expo-file-system/legacy";
import { getFileInfo, readFileText, writeFileText } from "./nativeFs";

/**
 * Astra trial licensing.
 *
 * A first-launch stamp is written to an app-private file that is deliberately
 * SEPARATE from config.json, so "reset settings" never resets the trial.
 * Expiry is `startedAt + TRIAL_DAYS`, and a monotonic `lastSeenMax` defeats the
 * obvious bypass of winding the device clock back.
 *
 * Limits worth knowing: this is client-side only. Clearing app data (or
 * reinstalling) grants a fresh trial, and the bundled Debian shell runs as the
 * same UID, so a determined user can edit the record. Real enforcement needs a
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

const LICENSE_FILE = `${FileSystem.documentDirectory || ""}.license.json`;

export type TrialStatus = "active" | "expired";
export type ExpiredReason = "trial-ended" | "clock-tampering";

export interface LicenseState {
  status: TrialStatus;
  /** Epoch ms of the very first launch. */
  startedAt: number;
  /** Epoch ms the trial runs out. */
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

async function readRecord(): Promise<LicenseRecord | null> {
  try {
    const info = await getFileInfo(LICENSE_FILE);
    if (!info.exists) return null;
    const parsed = JSON.parse(await readFileText(LICENSE_FILE)) as Partial<LicenseRecord>;
    if (!parsed || typeof parsed.startedAt !== "number") return null;
    return {
      startedAt: parsed.startedAt,
      expiresAt:
        typeof parsed.expiresAt === "number"
          ? parsed.expiresAt
          : parsed.startedAt + TRIAL_DAYS * DAY_MS,
      lastSeenMax: typeof parsed.lastSeenMax === "number" ? parsed.lastSeenMax : parsed.startedAt,
      unlocked: !!parsed.unlocked,
    };
  } catch (e) {
    console.error("Failed to read license record:", e);
    return null;
  }
}

async function writeRecord(record: LicenseRecord): Promise<void> {
  try {
    await writeFileText(LICENSE_FILE, JSON.stringify(record, null, 2));
  } catch (e) {
    console.error("Failed to write license record:", e);
  }
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
 * monotonic clock guard, and is cheap to call repeatedly. The memo expires with
 * the trial (see `CACHE_TTL_MS`), so crossing the deadline flips the result even
 * if the session is never backgrounded.
 */
export async function getLicenseState(force = false): Promise<LicenseState> {
  if (cached && !force && Date.now() < cachedValidUntil) return cached;
  return withLock(async () => {
    if (cached && !force && Date.now() < cachedValidUntil) return cached;
    const now = Date.now();
    let record = await readRecord();
    if (!record) {
      record = {
        startedAt: now,
        expiresAt: now + TRIAL_DAYS * DAY_MS,
        lastSeenMax: now,
        unlocked: false,
      };
      await writeRecord(record);
    } else if (now > record.lastSeenMax) {
      // Advance the high-water mark so a later clock rollback is detectable.
      record.lastSeenMax = now;
      await writeRecord(record);
    }
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
    const existing = await readRecord();
    const record: LicenseRecord = existing ?? {
      startedAt: now,
      expiresAt: now + TRIAL_DAYS * DAY_MS,
      lastSeenMax: now,
      unlocked: false,
    };
    record.unlocked = unlocked;
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
