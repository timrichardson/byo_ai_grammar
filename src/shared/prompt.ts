/**
 * Prompt builders for conservative grammar-only compose checks.
 *
 * These helpers keep prompts short, enforce the corrected-text JSON contract, and bound custom user
 * instructions so smaller OpenAI-compatible models remain predictable.
 */

const BASE_SYSTEM_PROMPT = [
  "You are a grammar checker for email composition.",
  "Return exactly one JSON object.",
  "The JSON object must contain exactly two keys: needs_change and corrected_text.",
  "needs_change must be a boolean.",
  "corrected_text must be the full corrected version of active_text.",
  "Do not return markdown, code fences, commentary, or extra keys.",
  "Ignore spelling mistakes, apart from homophone or function-word confusions that make the sentence grammatically wrong in context.",
  "Correct clearly wrong function-word choices and homophone confusions such as to/too/two, their/there/they're, your/you're, and its/it's.",
  "If active_text is already acceptable, set needs_change to false and return it unchanged character-for-character.",
  "If active_text needs a grammar correction, set needs_change to true and prefer the smallest possible local correction.",
  "Do not rewrite acceptable wording, cadence, punctuation, or phrasing just to make it sound better.",
  "Keep original words whenever possible; fix agreement or the wrong function word before replacing content words.",
  "Do not rewrite tone or style beyond what is needed for correctness.",
  "Preserve names, product names, quoted text, and meaning.",
  "Only make small grammar corrections that can be applied locally."
];

export const MAX_CUSTOM_PROMPT_CHARS = 600;
export const MAX_ALLOWLIST_ENTRIES = 50;
export const MAX_ALLOWLIST_TOTAL_CHARS = 800;

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** Normalizes user-provided custom instructions before they are embedded in the system prompt. */
export function normalizeCustomPrompt(value: string): string {
  return normalizeWhitespace(value).slice(0, MAX_CUSTOM_PROMPT_CHARS);
}

/** Normalizes, deduplicates, and bounds allowlist entries before prompt or filter use. */
export function normalizeAllowlistEntries(values: string[] | string): string[] {
  const rawValues = Array.isArray(values) ? values : values.split(/\r?\n/);
  const unique = new Set<string>();
  const normalized: string[] = [];
  let totalChars = 0;

  for (const value of rawValues) {
    const entry = normalizeWhitespace(value).slice(0, 120);
    if (!entry) {
      continue;
    }

    const dedupeKey = entry.toLowerCase();
    if (unique.has(dedupeKey)) {
      continue;
    }

    const nextTotal = totalChars + entry.length;
    if (normalized.length >= MAX_ALLOWLIST_ENTRIES || nextTotal > MAX_ALLOWLIST_TOTAL_CHARS) {
      break;
    }

    unique.add(dedupeKey);
    normalized.push(entry);
    totalChars = nextTotal;
  }

  return normalized;
}

/** Builds the strict system and user prompt payload sent to the language service. */
export function buildPrompt(args: {
  activeText: string;
  contextText: string;
  customPrompt: string;
  grammarAllowlist: string[];
}): { system: string; user: string } {
  const normalizedCustomPrompt = normalizeCustomPrompt(args.customPrompt);
  const allowlist = normalizeAllowlistEntries(args.grammarAllowlist);
  const system = [
    ...BASE_SYSTEM_PROMPT,
    allowlist.length > 0
      ? `Do not change these approved terms or phrases on their own: ${allowlist.join(" | ")}.`
      : "",
    normalizedCustomPrompt ? `Additional user instructions: ${normalizedCustomPrompt}` : ""
  ]
    .filter(Boolean)
    .join(" ");

  return {
    system,
    user: JSON.stringify({
      active_text: args.activeText,
      nearby_context: args.contextText
    })
  };
}
