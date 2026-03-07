import type { SuggestionIssue } from "./types";

function isIssueType(value: unknown): value is SuggestionIssue["type"] {
  return value === "grammar";
}

export function normalizeIssues(raw: unknown, sourceText: string): SuggestionIssue[] {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { issues?: unknown[] }).issues)) {
    throw new Error("The language service did not return an issues array.");
  }

  const parsed: SuggestionIssue[] = [];
  for (const item of (raw as { issues: unknown[] }).issues) {
    if (!item || typeof item !== "object") {
      throw new Error("An issue entry was not an object.");
    }

    const issue = item as Record<string, unknown>;
    const offset = Number(issue.offset);
    const length = Number(issue.length);
    const text = String(issue.text ?? "");
    const type = issue.type;
    const message = String(issue.message ?? "");
    const suggestions = Array.isArray(issue.suggestions)
      ? issue.suggestions.map((value) => String(value)).filter(Boolean).slice(0, 5)
      : [];

    if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length <= 0) {
      throw new Error("The language service returned an invalid offset or length.");
    }

    if (!isIssueType(type)) {
      throw new Error("The language service returned an unsupported issue type.");
    }

    if (offset + length > sourceText.length) {
      throw new Error("The language service returned an out-of-range issue.");
    }

    if (!message) {
      throw new Error("The language service returned an issue without a message.");
    }

    const excerpt = sourceText.slice(offset, offset + length);
    parsed.push({
      offset,
      length,
      text: text || excerpt,
      type,
      message,
      suggestions
    });
  }

  parsed.sort((a, b) => a.offset - b.offset);
  for (let i = 1; i < parsed.length; i += 1) {
    const previous = parsed[i - 1];
    const current = parsed[i];
    if (current.offset < previous.offset + previous.length) {
      throw new Error("The language service returned overlapping issues.");
    }
  }

  return parsed;
}
