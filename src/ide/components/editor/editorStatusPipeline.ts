/**
 * editorStatusPipeline — single status pipeline for the editor footer area.
 *
 * EditorFloatingHud (zoom/split/format toasts), EditorStatusBar (bracket
 * partner + current-line diagnostic), and ProblemsPanel (full diagnostics
 * list) previously each decided visibility and styling on their own.
 * This module centralizes item selection + priority so EditorView feeds one
 * ordered list into solid, elevated, bordered surfaces.
 */

export type StatusItemKind =
  | "toast"
  | "bracket"
  | "diagnostic"
  | "problems-toggle";

export interface StatusItem {
  kind: StatusItemKind;
  /** Short label rendered in the surface. */
  text: string;
  /** Diagnostic severity when kind is diagnostic/bracket. */
  severity?: "error" | "warning" | "info";
  /** Line number for diagnostics (tap-to-jump). */
  line?: number;
}

export interface StatusPipelineInput {
  splitToast?: string | null;
  zoomBadge?: string | null;
  formatToast?: string | null;
  matchStatus?: string | null;
  matchKind?: string;
  currentLineDiag?: { line: number; message: string; severity?: string } | null;
  errorCount?: number;
  warningCount?: number;
  showProblems?: boolean;
}

/**
 * Build the ordered status items for the current editor state.
 * Toasts first (transient), then bracket partner, then the
 * current-line diagnostic. The Problems toggle is derived from counts.
 */
export function selectStatusItems(input: StatusPipelineInput): StatusItem[] {
  const items: StatusItem[] = [];

  if (input.splitToast) {
    items.push({ kind: "toast", text: input.splitToast });
  } else if (input.zoomBadge) {
    items.push({ kind: "toast", text: input.zoomBadge });
  }
  if (input.formatToast) {
    items.push({ kind: "toast", text: input.formatToast });
  }

  if (input.matchStatus) {
    items.push({
      kind: "bracket",
      text: input.matchStatus,
      severity: input.matchKind === "unmatched" ? "error" : "info",
    });
  }

  if (input.currentLineDiag && !input.showProblems) {
    const sev =
      input.currentLineDiag.severity === "error" ? "error" : ("warning" as const);
    items.push({
      kind: "diagnostic",
      text: `Line ${input.currentLineDiag.line}: ${input.currentLineDiag.message}`,
      severity: sev,
      line: input.currentLineDiag.line,
    });
  }

  const problems = (input.errorCount || 0) + (input.warningCount || 0);
  if (problems > 0) {
    items.push({
      kind: "problems-toggle",
      text: `${input.errorCount || 0} errors, ${input.warningCount || 0} warnings`,
      severity: (input.errorCount || 0) > 0 ? "error" : "warning",
    });
  }

  return items;
}
