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
 * alias** avoids exactly that: FormSubmit swaps the address for a random string, and its AJAX endpoint returns the JSON this
 * module parses (the plain endpoint answers with HTML). Activation is PER DESTINATION: the first
 * submission emails an "Activate Form" link, and until it is clicked every send is refused with
 * success:false. The alias comes from that same form email. To CC a second inbox, add it in
 * FormSubmit's own form settings rather than here.
 * string (`<hash>`), so the endpoint below names nobody.
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
 * While this is empty the screen shows an honest "relay not configured yet"
 * state instead of pretending to send.
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
  /** Optional address the developer should reply to (the user's own). */
  replyTo?: string;
  /** One-line environment summary, e.g. "Astra 1.0.0 · Android 14 · Pixel 6". */
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

/** The logical report. Contains no developer address. */
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
 * Encodes the report as the `application/x-www-form-urlencoded` body FormSubmit
 * reads — named form fields, exactly what a FormSubmit form posts. Hand-rolled
 * with `encodeURIComponent` rather than `URLSearchParams` so it depends on
 * nothing the JS runtime might not ship.
 */
export function encodeFeedbackForm(payload: FeedbackPayload): string {
  const fields: Array<[string, string]> = [
    ["_subject", payload.subject],
    ["_template", "table"],
    ["_captcha", "false"],
    ["message", payload.message],
    ["source", payload.source],
  ];
  if (payload.replyTo) fields.push(["email", payload.replyTo]);
  if (payload.diagnostics) fields.push(["diagnostics", payload.diagnostics]);
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
