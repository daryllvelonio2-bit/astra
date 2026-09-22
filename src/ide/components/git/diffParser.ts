export interface ParsedDiffLine {
  type: "hunk" | "add" | "del" | "context" | "meta-notice";
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
}

export interface DiffParseResult {
  lines: ParsedDiffLine[];
  additions: number;
  deletions: number;
  infoMessage?: string;
}

export function parseUnifiedDiff(rawDiff: string): DiffParseResult {
  const trimmed = (rawDiff || "").trim();
  if (!trimmed || trimmed === "No changes detected.") {
    return { lines: [], additions: 0, deletions: 0, infoMessage: "No changes detected." };
  }
  if (trimmed.includes("Binary files") && trimmed.includes("differ")) {
    return { lines: [], additions: 0, deletions: 0, infoMessage: "Binary file not shown." };
  }
  if (trimmed.startsWith("Error loading diff:")) {
    return { lines: [], additions: 0, deletions: 0, infoMessage: trimmed };
  }
  if (trimmed === "Empty file (no content).") {
    return { lines: [], additions: 0, deletions: 0, infoMessage: "Empty file (no content)." };
  }

  const rawLines = trimmed.split(/\r?\n/);
  const lines: ParsedDiffLine[] = [];
  let additions = 0;
  let deletions = 0;

  let currentOldLine = 0;
  let currentNewLine = 0;
  let inHunk = false;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];

    // Hunk header: @@ -old,len +new,len @@ [title]
    if (line.startsWith("@@")) {
      inHunk = true;
      const match = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@(.*)$/);
      if (match) {
        currentOldLine = parseInt(match[1], 10);
        currentNewLine = parseInt(match[2], 10);
      }
      lines.push({ type: "hunk", content: line });
      continue;
    }

    // Skip git diff metadata headers (diff --git, index, ---, +++, new file mode, etc.)
    if (!inHunk) {
      continue;
    }

    if (line.startsWith("+")) {
      additions++;
      lines.push({
        type: "add",
        newLineNumber: currentNewLine,
        content: line.slice(1),
      });
      currentNewLine++;
    } else if (line.startsWith("-")) {
      deletions++;
      lines.push({
        type: "del",
        oldLineNumber: currentOldLine,
        content: line.slice(1),
      });
      currentOldLine++;
    } else if (line.startsWith(" ")) {
      lines.push({
        type: "context",
        oldLineNumber: currentOldLine,
        newLineNumber: currentNewLine,
        content: line.slice(1),
      });
      currentOldLine++;
      currentNewLine++;
    } else if (line.startsWith("\\")) {
      lines.push({
        type: "meta-notice",
        content: line,
      });
    } else if (line.length > 0) {
      lines.push({
        type: "context",
        oldLineNumber: currentOldLine || undefined,
        newLineNumber: currentNewLine || undefined,
        content: line,
      });
      if (currentOldLine) currentOldLine++;
      if (currentNewLine) currentNewLine++;
    }
  }

  // Fallback if no @@ hunks were found in non-empty diff
  if (lines.length === 0 && rawLines.length > 0) {
    const filtered = rawLines.filter(
      (l) =>
        !l.startsWith("diff --git") &&
        !l.startsWith("index ") &&
        !l.startsWith("--- ") &&
        !l.startsWith("+++ ") &&
        !l.startsWith("new file mode") &&
        !l.startsWith("deleted file mode")
    );
    if (filtered.length === 0) {
      return { lines: [], additions: 0, deletions: 0, infoMessage: "Empty file or no changes." };
    }
    filtered.forEach((l, idx) => {
      lines.push({
        type: "context",
        newLineNumber: idx + 1,
        content: l,
      });
    });
  }

  return { lines, additions, deletions };
}
