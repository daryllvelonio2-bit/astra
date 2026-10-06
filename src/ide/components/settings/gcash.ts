/**
 * GCash donation details — pure helpers, no react-native imports, so the
 * number checks run headlessly.
 *
 * That matters more than it looks: GCash Express Send cannot be undone, so a
 * single wrong digit in a shipped APK sends a stranger someone else's money.
 * The number is validated here rather than eyeballed, and it is never guessed.
 */

/**
 * Where donors send. Format: 09XXXXXXXXX (or +639XXXXXXXXX). Empty until set.
 */
export const GCASH_NUMBER = "";

/** Nickname shown above the number, e.g. "Astra". */
export const GCASH_LABEL = "Astra";

/** Canonical form: digits only, +63 / 63 prefixes folded to a leading 0. */
export function normalizeGcashNumber(raw: string): string {
  const digits = (raw || "").replace(/[\s\-().]/g, "");
  if (digits.startsWith("+63")) return `0${digits.slice(3)}`;
  if (digits.startsWith("63") && digits.length === 12) return `0${digits.slice(2)}`;
  return digits;
}

/** True only for a PH mobile in canonical form. Everything else is rejected. */
export function isValidGcashNumber(raw: string): boolean {
  return /^09\d{9}$/.test(normalizeGcashNumber(raw));
}

/** "0917 123 4567" — grouped the way GCash shows it, easier to eyeball. */
export function formatGcashNumber(raw: string): string {
  const n = normalizeGcashNumber(raw);
  return n.length === 11 ? `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}` : n;
}

/** The exact string that goes on the clipboard. */
export function gcashClipboardValue(raw: string = GCASH_NUMBER): string {
  return isValidGcashNumber(raw) ? normalizeGcashNumber(raw) : "";
}
