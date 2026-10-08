/**
 * The AI assistant's system prompt — the single place it is assembled.
 *
 * Sections live in their own modules (1 feature = 1 file) and are contributed
 * here; the environment/capabilities section is `./environmentContext`. Keep
 * this file thin: new prompt sections are added as their own module and listed
 * below, so no file grows past the 500-line cap and each section stays testable
 * on its own.
 *
 * NOTE: before this file existed, the assistant's prompt stack had been removed
 * with the old chat feature; nothing assembled a system prompt. This is the
 * re-introduced assembly point — the place a chat/AI service should call.
 */
import { buildEnvironmentSection } from "./environmentContext";

export interface PromptSection {
  /** Stable identifier for the section (logging / de-duplication). */
  id: string;
  /** The section's text, as it appears in the assembled prompt. */
  text: string;
}

/** Every section the system prompt is built from, in order. */
export function buildPromptSections(): PromptSection[] {
  return [
    { id: "environment", text: buildEnvironmentSection() },
  ];
}

/** The full system prompt handed to the model. */
export function buildAssistantSystemPrompt(): string {
  return buildPromptSections()
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join("\n\n");
}
