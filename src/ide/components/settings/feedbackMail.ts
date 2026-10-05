/**
 * Feedback mail — pure, dependency-free helpers for the Feedback screen.
 *
 * Delivery is a `mailto:` handoff to the device's own mail app: no server, no
 * API key, and no third-party account is involved, so nothing secret ships in
 * the APK and the user can see exactly who the message goes to. A hosted
 * endpoint would need an owned server (or a form relay that must be activated
 * from each inbox first) — see the section note in FeedbackSection.
 */

/** Where user feedback is delivered. Change here, not in the UI. */
export const FEEDBACK_RECIPIENTS: string[] = [
  "jayjeminoababon@gmail.com",
  "daryllvelonio@gmail.com",
];

/**
 * Android hands `mailto:` to the mail app as an Intent extra; a body beyond
 * the transaction limit makes the handoff fail with TransactionTooLarge, so
 * long reports are cut with a visible marker instead of silently dying.
 */
export const MAX_BODY_CHARS = 4000;

export interface FeedbackMailInput {
  /** What the user typed. */
  message: string;
  /** Optional address the developer should reply to. */
  replyTo?: string;
  /** One-line environment summary, appended under a separator. */
  diagnostics?: string;
  /** Defaults to FEEDBACK_RECIPIENTS. */
  recipients?: string[];
}

/** Longest subject we will build, so a pasted blob cannot become the subject. */
const MAX_SUBJECT_CHARS = 120;

export function buildFeedbackSubject(message: string): string {
  const firstLine = (message || "").split(/\r?\n/).find((l) => l.trim().length > 0) || "";
  const subject = firstLine.trim().slice(0, MAX_SUBJECT_CHARS);
  return subject ? `Astra feedback: ${subject}` : "Astra feedback";
}

/**
 * RFC 6068 wants CRLF, and mail apps render a bare LF as one run-on line —
 * which turns a written report into a wall of text. Normalising HERE (not in
 * the URI builder) keeps every consumer byte-identical: the mailto: query, the
 * .eml, and the no-mail-app fallback all carry the same string.
 */
function toCrlf(s: string): string {
  return s.replace(/\r\n|\r|\n/g, "\r\n");
}

/** Message body: what they wrote, where to reply, then the environment line. */
export function buildFeedbackBody(input: FeedbackMailInput): string {
  const message = (input.message || "").trim();
  const parts = [message];
  const replyTo = (input.replyTo || "").trim();
  if (replyTo) parts.push(`Reply to: ${replyTo}`);
  const diagnostics = (input.diagnostics || "").trim();
  if (diagnostics) parts.push(`--\n${diagnostics}`);

  const body = parts.filter((p) => p.length > 0).join("\n\n");
  const final =
    body.length <= MAX_BODY_CHARS
      ? body
      : `${body.slice(0, MAX_BODY_CHARS)}\n\n[... truncated — message was ${body.length} characters]`;
  return toCrlf(final);
}

/**
 * Builds the `mailto:` URI.
 *
 * `encodeURIComponent` leaves `!'()*` alone, which is legal in a mailto body,
 * and escapes `#`/`&`/`?` so they cannot split the query. The body it encodes
 * is exactly what `buildFeedbackBody` returns — asserted in the harness.
 */
export function buildFeedbackMailto(input: FeedbackMailInput): string {
  const recipients = (input.recipients || FEEDBACK_RECIPIENTS)
    .map((r) => (r || "").trim())
    .filter((r) => r.length > 0);
  const to = recipients.join(",");

  const query = [
    `subject=${encodeURIComponent(buildFeedbackSubject(input.message))}`,
    `body=${encodeURIComponent(buildFeedbackBody(input))}`,
  ].join("&");

  return `mailto:${to}?${query}`;
}

/** Plain-text version of the same report, for the "no mail app" fallback. */
export function buildFeedbackPlainText(input: FeedbackMailInput): string {
  const recipients = (input.recipients || FEEDBACK_RECIPIENTS).filter(Boolean).join(", ");
  return [
    `To: ${recipients}`,
    `Subject: ${buildFeedbackSubject(input.message)}`,
    "",
    buildFeedbackBody(input),
  ].join("\n");
}
