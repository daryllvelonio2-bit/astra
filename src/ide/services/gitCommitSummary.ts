import { loadApiKey, loadSelectedModel, DEFAULT_MODEL_ID } from "./configService";
import { getGitFileDiff } from "./gitService";
import type { GitFileStatus } from "../components/git/types";

const MAX_FILES = 15;
const MAX_DIFF_CHARS_PER_FILE = 2500;
const MAX_TOTAL_CHARS = 12000;

export interface CommitSummary {
  summary: string;
  description: string;
}

/**
 * Generates a GitHub-style commit summary + description from the working
 * directory diffs, using the user's own configured Gemini API key and model
 * (the same key used for chat). Throws a user-readable error on failure.
 */
export async function generateCommitSummary(
  workspaceId: string | undefined,
  files: GitFileStatus[]
): Promise<CommitSummary> {
  const apiKey = (await loadApiKey()).trim();
  if (!apiKey) {
    throw new Error("No API key configured. Add your Gemini API key in Settings to generate summaries.");
  }
  if (files.length === 0) {
    throw new Error("No changed files to summarize.");
  }
  const model = (await loadSelectedModel()).trim() || DEFAULT_MODEL_ID;

  const picked = files.slice(0, MAX_FILES);
  const parts: string[] = [];
  let total = 0;
  for (const f of picked) {
    let diff = "";
    try {
      diff = await getGitFileDiff(workspaceId, f.path, f.staged);
    } catch (_) {
      diff = "Diff unavailable.";
    }
    if (total >= MAX_TOTAL_CHARS) break;
    diff = diff.slice(0, MAX_DIFF_CHARS_PER_FILE);
    if (total + diff.length > MAX_TOTAL_CHARS) {
      diff = diff.slice(0, MAX_TOTAL_CHARS - total);
    }
    total += diff.length;
    parts.push(`File: ${f.path} [${f.status}${f.staged ? ", staged" : ""}]\n${diff}`);
  }
  const remaining = files.length - picked.length;

  const prompt =
    "You are an expert Git commit message writer. Summarize the code changes below " +
    "like GitHub's AI commit message feature.\n" +
    "Rules:\n" +
    "- summary: single line, imperative mood, max 72 characters, no trailing period, no quotes.\n" +
    "- description: 1-4 concise bullet lines (each starting with '- '), max 400 characters total. " +
    "Empty string if the change is trivial.\n" +
    "- Never mention file paths verbatim unless essential.\n" +
    "Respond with RAW JSON only, no markdown fences: {\"summary\": \"...\", \"description\": \"...\"}\n\n" +
    `Changed files (${files.length}${remaining > 0 ? `, showing first ${picked.length}` : ""}):\n` +
    parts.join("\n\n---\n\n");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
      }),
    }
  );
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const errJson: any = await res.json();
      const msg = errJson?.error?.message;
      if (msg) detail += ` — ${msg}`;
    } catch (_) {
      // Fall through with the bare status.
    }
    throw new Error(`Summary generation failed (${detail})`);
  }
  const json: any = await res.json();
  const candidates: any[] = json?.candidates ?? [];
  const text: string = (candidates[0]?.content?.parts ?? [])
    .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
    .join("")
    .trim();
  if (!text) throw new Error("The model returned an empty summary. Try again.");

  const parsed = parseSummaryJson(text);
  if (!parsed.summary) throw new Error("Could not parse the generated summary. Try again.");
  return parsed;
}

function parseSummaryJson(text: string): CommitSummary {
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(cleaned.slice(start, end + 1));
      return {
        summary: String(obj?.summary ?? "").trim().slice(0, 100),
        description: String(obj?.description ?? "").trim().slice(0, 600),
      };
    } catch (_) {
      // Fall through to line-based fallback.
    }
  }
  const lines = cleaned.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return {
    summary: (lines[0] ?? "").replace(/^[-*]\s*/, "").slice(0, 100),
    description: lines.slice(1).join("\n").slice(0, 600),
  };
}
