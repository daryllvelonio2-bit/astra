/**
 * Feedback transport — sends a report from INSIDE the app to the developers.
 *
 * The developer addresses are deliberately NOT in this app. A client-side app
 * cannot email by itself: any SMTP password or mail-API key shipped in the APK
 * is extractable by anyone who unzips it — and would let them send mail as the
 * developers — while a mail-app handoff URL only opens the user's own mail app
 * and sends nothing. So the app POSTs the report to a relay (FEEDBACK_ENDPOINT)
 * that owns the destination. That relay is the only place the addresses live.
 *
 * No react-native imports: the whole path is exercised headlessly.
 */

/**
 * The FormSubmit relay endpoint the report is POSTed to.
 *
 * FormSubmit (https://formsubmit.co) is a free form-to-email relay: you POST
 * form fields to your form's endpoint and it forwards them as email — no API
 * key, no account, and no server of ours.
 *
 * Its plain form is `https://formsubmit.co/<address>`, which would put a
 * developer address in this file and on the wire. Its **invisible-email
 * alias** avoids exactly that: FormSubmit swaps the address for a random
 * string, and its AJAX endpoint returns the JSON this module parses (the plain
 * endpoint answers with HTML). Activation is PER DESTINATION: the first
 * submission emails an "Activate Form" link, and until it is clicked every send
 * is refused with success:false. The alias comes from that same form email. To
 * CC a second inbox, add it in FormSubmit's own form settings rather than here.
 *
 * WHERE THE HASH COMES FROM (one human step, outside the app):
 *   1. Submit the form once to the plain endpoint for the developer inbox —
 *      POST/`open https://formsubmit.co/<developer-address>` — and FormSubmit
 *      emails an "Activate Form" link to that inbox.
 *   2. Click that link. FormSubmit replies with the form's alias/`<hash>`.
 *   3. Paste the resulting endpoint here (the `el/<hash>` or the bare `/<hash>`
 *      form both accept the urlencoded body we send), e.g.
 *        export const FEEDBACK_ENDPOINT = "https://formsubmit.co/ajax/<random-string>";
 *
 * THE TWO DESTINATION ADDRESSES ARE CONFIGURED ON FORMSUBMIT'S SIDE, NOT HERE.
 * The form behind that hash is bound to the developer inbox; to reach BOTH
 * developers, add the second address as a CC in FormSubmit's form settings
 * (the `_cc` field) when activating. This constant, this file and the whole
 * app never name either address.
 *
 * While this is empty the send path reports the honest `unconfigured` reason;
 * the screen no longer advertises that state with a standing banner.
 */
export const FEEDBACK_ENDPOINT = "";

/**
 * Sent as `Referer` on every report.
 *
 * FormSubmit refuses a POST with no Referer at all ("Make sure you open this
 * page through a web server…"). Verified against the live endpoint: the guard
 * only checks that the header EXISTS — any value passes. This is the app's real
 * repository URL rather than a made-up origin.
 */
export const FEEDBACK_REFERER = "https://github.com/daryllvelonio2-bit/astra";

/** Relay must answer within this window or the attempt is abandoned. */
export const FEEDBACK_TIMEOUT_MS = 15000;

/** Matches the input's maxLength; a longer body is rejected, not truncated. */
export const FEEDBACK_MAX_CHARS = 4000;

/** Matches the reply-to input's maxLength. */
export const FEEDBACK_MAX_REPLY_TO = 120;

/**
 * The five report categories, in the order the picker shows them. This is the
 * single source of truth: the subject is built from one of these, validation
 * accepts only one of these, and the picker renders them in this order.
 */
export const FEEDBACK_CATEGORIES = [
  "Bug Report",
  "Feature Request",
  "UI/UX Suggestion",
  "Performance Issue",
  "General Feedback",
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

/** Pre-selected so a report is always valid without an extra tap. */
export const DEFAULT_FEEDBACK_CATEGORY: FeedbackCategory = "General Feedback";

/** True only for one of the five known categories. */
export function isFeedbackCategory(value: unknown): value is FeedbackCategory {
  return typeof value === "string" && (FEEDBACK_CATEGORIES as readonly string[]).includes(value);
}

export interface FeedbackInput {
  /** One of FEEDBACK_CATEGORIES. */
  category: FeedbackCategory;
  /** What the user typed. */
  message: string;
  /** Optional address the developer should reply to (the user's own). */
  replyTo?: string;
  /** Platform line the app can read, e.g. "Android 14 (API 35) · Pixel 6". */
  platform?: string;
  /** App version, e.g. "1.0.0". */
  appVersion?: string;
  /** ISO 8601 local timestamp; defaults to "now" when omitted. */
  submittedAt?: string;
  /** Free-form origin tag; defaults to "astra-android". */
  source?: string;
}

export interface FeedbackPayload {
  subject: string;
  category: FeedbackCategory;
  message: string;
  replyTo: string;
  submittedAt: string;
  platform: string;
  appVersion: string;
  source: string;
}

/** Machine-readable cause, for developers. The UI shows `error`, not this. */
export type FeedbackReason =
  | "unconfigured"
  | "invalid"
  | "rejected"
  | "not-activated"
  | "http"
  | "timeout"
  | "network";

/**
 * Result of a send attempt. Not a boolean-literal discriminated union on
 * purpose: this project's tsconfig does not narrow `if (result.ok)` on one, so
 * `error` would be inaccessible on the false branch.
 */
export interface FeedbackSendResult {
  ok: boolean;
  /** Safe to show the user. Never carries the server's own response text. */
  error?: string;
  reason?: FeedbackReason;
}

/** Same `fetch` signature, so the harness can hand in its own implementation. */
type FetchLike = typeof fetch;

export function isFeedbackConfigured(endpoint: string = FEEDBACK_ENDPOINT): boolean {
  const e = (endpoint || "").trim();
  return /^https:\/\/\S+$/i.test(e);
}

/** `[ASTRA Feedback] - {category}` — bounded, so a pasted blob can't leak in. */
export function buildFeedbackSubject(category: FeedbackCategory): string {
  const safe = isFeedbackCategory(category) ? category : DEFAULT_FEEDBACK_CATEGORY;
  return `[ASTRA Feedback] - ${safe}`;
}

/**
 * Local wall-clock time as ISO 8601 with offset (e.g. "2026-10-10T14:23:05+08:00").
 * Timezone-aware so the team can read when the report was written; the app sends
 * its own clock, which is all a client can honestly do.
 */
export function localIsoTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const ymd = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const hms = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  const zone = `${sign}${pad(Math.floor(Math.abs(offsetMin) / 60))}:${pad(Math.abs(offsetMin) % 60)}`;
  return `${ymd}T${hms}${zone}`;
}

/**
 * Validates the user's input. Returns a message to show the user, or null when
 * it is fine. Runs BEFORE any request, so an empty/oversized report or a
 * malformed address never reaches the relay at all. Deliberately loose on the
 * address: many valid addresses fail clever regexes, and a wrong address is a
 * nuisance, not a security problem — it is only checked when non-empty.
 */
export function validateFeedbackInput(input: FeedbackInput): string | null {
  if (!isFeedbackCategory(input.category)) return "Choose a category first.";
  const message = (input.message || "").trim();
  if (!message) return "Write a message first.";
  if (message.length > FEEDBACK_MAX_CHARS) {
    return `That message is too long — keep it under ${FEEDBACK_MAX_CHARS} characters.`;
  }
  const replyTo = (input.replyTo || "").trim();
  if (replyTo.length > FEEDBACK_MAX_REPLY_TO) return "That email address is too long.";
  if (replyTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)) {
    return "That doesn't look like an email address.";
  }
  return null;
}

/** The logical report. Contains no developer address. */
export function buildFeedbackPayload(input: FeedbackInput): FeedbackPayload {
  const category = isFeedbackCategory(input.category) ? input.category : DEFAULT_FEEDBACK_CATEGORY;
  return {
    subject: buildFeedbackSubject(category),
    category,
    message: (input.message || "").trim(),
    replyTo: (input.replyTo || "").trim(),
    submittedAt: (input.submittedAt || "").trim() || localIsoTimestamp(),
    platform: (input.platform || "").trim(),
    appVersion: (input.appVersion || "").trim(),
    source: (input.source || "").trim() || "astra-android",
  };
}

/**
 * Encodes the report as the `application/x-www-form-urlencoded` body FormSubmit
 * reads — named form fields, exactly what a FormSubmit form posts. The `_subject`,
 * `_template` and `_captcha` names are the relay's own conventions; `email` is its
 * reply-to field. Hand-rolled with `encodeURIComponent` rather than
 * `URLSearchParams` so it depends on nothing the JS runtime might not ship.
 */
export function encodeFeedbackForm(payload: FeedbackPayload): string {
  const fields: Array<[string, string]> = [
    ["_subject", payload.subject],
    ["_template", "table"],
    ["_captcha", "false"],
    ["category", payload.category],
    ["message", payload.message],
  ];
  if (payload.replyTo) fields.push(["email", payload.replyTo]);
  if (payload.submittedAt) fields.push(["submitted_at", payload.submittedAt]);
  if (payload.platform) fields.push(["platform", payload.platform]);
  if (payload.appVersion) fields.push(["app_version", payload.appVersion]);
  if (payload.source) fields.push(["source", payload.source]);
  return fields
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

/**
 * Reads a provider's `success` flag. FormSubmit returns it as the STRING
 * "true"/"false" in some responses and a real boolean in others, so both are
 * accepted. Returns null when the body carries no such flag (e.g. the classic
 * form endpoint answers with an HTML thank-you page), in which case the HTTP
 * status decides.
 */
export function readSuccessFlag(text: string): boolean | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const raw = (parsed as { success?: unknown }).success;
  if (raw === true || raw === "true") return true;
  if (raw === false || raw === "false") return false;
  return null;
}

/** True when a rejection is the provider telling us the alias isn't active. */
export function isActivationNotice(text: string): boolean {
  return /activat/i.test(text || "");
}

/**
 * Sends the report. Never throws: every failure comes back as
 * `{ ok: false, error, reason }` with a message safe to show the user — the
 * provider's own text is never surfaced (it can carry internals).
 */
export async function sendFeedback(
  input: FeedbackInput,
  options?: { endpoint?: string; timeoutMs?: number; fetchImpl?: FetchLike; referer?: string }
): Promise<FeedbackSendResult> {
  const endpoint = ((options?.endpoint ?? FEEDBACK_ENDPOINT) || "").trim();
  if (!isFeedbackConfigured(endpoint)) {
    return { ok: false, error: "The feedback relay isn't configured yet.", reason: "unconfigured" };
  }

  const invalid = validateFeedbackInput(input);
  if (invalid) return { ok: false, error: invalid, reason: "invalid" };

  const doFetch: FetchLike = options?.fetchImpl ?? fetch;
  const timeoutMs = options?.timeoutMs ?? FEEDBACK_TIMEOUT_MS;
  const referer = (options?.referer ?? FEEDBACK_REFERER).trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await doFetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        ...(referer ? { Referer: referer } : {}),
      },
      body: encodeFeedbackForm(buildFeedbackPayload(input)),
      signal: controller.signal,
    });

    // Read the text first: the flag decides, not the status alone (FormSubmit
    // answers HTTP 200 even when it refuses — see the note on readSuccessFlag).
    let text = "";
    try {
      text = await res.text();
    } catch (_) {
      text = "";
    }
    const flag = readSuccessFlag(text);

    if (flag === false) {
      if (isActivationNotice(text)) {
        return {
          ok: false,
          error: "Feedback isn't available right now. Please try again later.",
          reason: "not-activated",
        };
      }
      return { ok: false, error: "The feedback service refused the report.", reason: "rejected" };
    }
    if (flag === true) return { ok: true };
    if (!res.ok) {
      return {
        ok: false,
        error: `The feedback service rejected the report (HTTP ${res.status}).`,
        reason: "http",
      };
    }
    // 2xx with no flag: the classic form endpoint answered with its thank-you
    // page, which means the relay accepted the submission.
    return { ok: true };
  } catch (e: any) {
    // AbortError = our own timeout; anything else is a transport failure.
    if (e?.name === "AbortError") {
      return {
        ok: false,
        error: "Timed out reaching the feedback service. Check your connection and try again.",
        reason: "timeout",
      };
    }
    return {
      ok: false,
      error: "Couldn't reach the feedback service. Check your connection and try again.",
      reason: "network",
    };
  } finally {
    clearTimeout(timer);
  }
}
