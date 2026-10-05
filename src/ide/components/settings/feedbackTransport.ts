/**
 * Feedback transport — sends a report from INSIDE the app.
 *
 * The developer addresses are deliberately NOT in this app. A client-side app
 * cannot email by itself: any SMTP password or mail-API key shipped in the APK
 * is extractable by anyone who unzips it — and would let them send mail as the
 * developers — while `mailto:` only opens the user's own mail app and sends
 * nothing. So the app POSTs the report to a relay (FEEDBACK_ENDPOINT) that
 * owns the destination. That relay is the only place the addresses live.
 *
 * No react-native imports: the whole path is exercised headlessly.
 */

/**
 * HTTPS relay that forwards the report to the developers.
 *
 * Set this to a FormSubmit **invisible-email alias** — a random string, NOT an
 * address — e.g. `https://formsubmit.co/ajax/<random-string>`. You get that
 * string by submitting once to `https://formsubmit.co/ajax/<your-address>` from
 * a shell and clicking the "Activate Form" link that arrives; the activation
 * email contains the alias, and the alias reveals nothing about the inbox. No
 * account, no API key, no dashboard, no secret is involved.
 *
 * Contract the app expects (generic, any relay that matches it will do):
 *   POST <endpoint>  {subject, message, replyTo, diagnostics, source}
 *   -> 2xx with no `success` field, or with `success: true`  = delivered
 *   -> `success: false`                                     = rejected
 *   -> anything else                                         = rejected
 *
 * FormSubmit answers **HTTP 200 even when it refuses a submission**, which is
 * why the body flag is checked and not just the status code.
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

/** Longest subject we will build, so a pasted blob cannot become the subject. */
const MAX_SUBJECT_CHARS = 120;

export interface FeedbackInput {
  /** What the user typed. */
  message: string;
  /** Optional address the developer should reply to. */
  replyTo?: string;
  /** One-line environment summary, e.g. "Astra 1.0.0 · android API 35". */
  diagnostics?: string;
}

export interface FeedbackPayload {
  subject: string;
  message: string;
  replyTo: string;
  diagnostics: string;
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

export function buildFeedbackSubject(message: string): string {
  const firstLine = (message || "").split(/\r?\n/).find((l) => l.trim().length > 0) || "";
  const subject = firstLine.trim().slice(0, MAX_SUBJECT_CHARS);
  return subject ? `Astra feedback: ${subject}` : "Astra feedback";
}

/**
 * Validates the user's input. Returns a message to show the user, or null when
 * it is fine. Deliberately loose on the address: many valid addresses fail
 * clever regexes, and a wrong address is a nuisance, not a security problem.
 */
export function validateFeedbackInput(input: FeedbackInput): string | null {
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

/** The exact JSON body put on the wire. Contains no developer address. */
export function buildFeedbackPayload(input: FeedbackInput): FeedbackPayload {
  return {
    subject: buildFeedbackSubject(input.message),
    message: (input.message || "").trim(),
    replyTo: (input.replyTo || "").trim(),
    diagnostics: (input.diagnostics || "").trim(),
    source: "astra-android",
  };
}

/**
 * Reads a provider's `success` flag. FormSubmit returns it as the STRING
 * "true"/"false" in some responses and a real boolean in others, so both are
 * accepted. Returns null when the body carries no such flag (plain relays), in
 * which case the HTTP status decides.
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
    return { ok: false, error: "Feedback isn't connected yet.", reason: "unconfigured" };
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
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(referer ? { Referer: referer } : {}),
      },
      body: JSON.stringify(buildFeedbackPayload(input)),
      signal: controller.signal,
    });

    // Read the text first: the flag decides, not the status (see the note on
    // FEEDBACK_ENDPOINT about 200-with-success:false).
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
