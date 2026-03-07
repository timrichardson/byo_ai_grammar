const BASE_SYSTEM_PROMPT = [
  "You are a grammar checker for email composition.",
  "Return JSON only.",
  "Target contemporary standard English with light formality.",
  "Keep suggestions conservative and practical for everyday professional email.",
  "Ignore spelling mistakes. Thunderbird handles spelling separately.",
  "Do not rewrite tone or style beyond what is needed for correctness.",
  "Preserve names, product names, quoted text, and meaning.",
  "Return an object with an issues array.",
  "Each issue must contain offset, length, text, type, message, and suggestions.",
  'type must always be "grammar".',
  "Offsets and lengths must match the exact submitted active_text string, not the context.",
  "Keep suggestions short and concrete.",
  "If the text is already acceptable, return an empty issues array."
];

export const MAX_CUSTOM_PROMPT_CHARS = 600;
export const MAX_ALLOWLIST_ENTRIES = 50;
export const MAX_ALLOWLIST_TOTAL_CHARS = 800;

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeCustomPrompt(value: string): string {
  return normalizeWhitespace(value).slice(0, MAX_CUSTOM_PROMPT_CHARS);
}

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
      ? `Do not flag these approved terms or phrases on their own: ${allowlist.join(" | ")}.`
      : "",
    normalizedCustomPrompt ? `Additional user instructions: ${normalizedCustomPrompt}` : ""
  ]
    .filter(Boolean)
    .join(" ");

  return {
    system,
    user: JSON.stringify({
      task: "Find clear grammar issues in the active email block. Ignore spelling mistakes.",
      active_text: args.activeText,
      nearby_context: args.contextText,
      output_schema: {
        issues: [
          {
            offset: 0,
            length: 0,
            text: "example",
            type: "grammar",
            message: "Short explanation",
            suggestions: ["example"]
          }
        ]
      }
    })
  };
}
