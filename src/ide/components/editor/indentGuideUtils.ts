import type { CodeToken } from "../../services/syntaxTokenizer";

export const MONO_CHAR_WIDTH = 7.8;

/**
 * Detects whether the file predominantly uses 2-space or 4-space indentation.
 */
export function detectIndentStep(
  lines: { indentWidth?: number }[],
  fallback = 2
): number {
  let has2or6 = false;
  let has4 = false;
  for (const line of lines) {
    const w = line.indentWidth || 0;
    if (w <= 0) continue;
    if (w % 4 !== 0 && w % 2 === 0) {
      has2or6 = true;
      break;
    }
    if (w % 4 === 0) has4 = true;
  }
  if (has2or6) return 2;
  if (has4) return 4;
  return fallback;
}

/**
 * Computes effective indentation for each line, propagating block indent through blank lines.
 */
export function computeEffectiveIndents(
  lines: { lineNumber: number; tokens: CodeToken[]; indentWidth?: number }[]
): number[] {
  const len = lines.length;
  if (len === 0) return [];

  const rawIndents = new Array(len);
  for (let i = 0; i < len; i++) {
    const l = lines[i];
    const isBlank = !l.tokens.length || l.tokens.every((t) => !t.text.trim());
    rawIndents[i] = isBlank ? -1 : (l.indentWidth || 0);
  }

  const prevNonBlank = new Array(len);
  let lastNonBlank = 0;
  for (let i = 0; i < len; i++) {
    if (rawIndents[i] !== -1) lastNonBlank = rawIndents[i];
    prevNonBlank[i] = lastNonBlank;
  }

  const nextNonBlank = new Array(len);
  let nextVal = 0;
  for (let i = len - 1; i >= 0; i--) {
    if (rawIndents[i] !== -1) nextVal = rawIndents[i];
    nextNonBlank[i] = nextVal;
  }

  const effective = new Array(len);
  for (let i = 0; i < len; i++) {
    effective[i] = rawIndents[i] === -1 ? Math.min(prevNonBlank[i], nextNonBlank[i]) : rawIndents[i];
  }
  return effective;
}

/**
 * Computes horizontal pixel offsets for indent guides on each line.
 * Guaranteed invariant: Every guide column is strictly less than the line's code column,
 * preventing any collision or overlap with code characters.
 */
export function computeLineGuides(
  lines: { lineNumber: number; tokens: CodeToken[]; indentWidth?: number }[],
  enabled: boolean,
  indentStep: number,
  charWidth = MONO_CHAR_WIDTH
): number[][] {
  if (!enabled || indentStep <= 0) return lines.map(() => []);

  const effectiveIndents = computeEffectiveIndents(lines);
  return lines.map((_, idx) => {
    const indentWidth = effectiveIndents[idx] ?? 0;
    const guides: number[] = [];
    if (indentWidth > indentStep) {
      for (let col = indentStep; col < indentWidth; col += indentStep) {
        guides.push(Math.round(col * charWidth));
      }
    }
    return guides;
  });
}
