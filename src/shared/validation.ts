import type { CorrectedTextResult } from "./types";

/**
 * Normalizes OpenAI-compatible response payloads into the strict `corrected_text` contract used by
 * the extension.
 *
 * Providers often wrap JSON in markdown fences or unexpected object shapes, so this module recovers
 * a usable `corrected_text` value while still rejecting empty or over-broad rewrites.
 */

const MAX_TEXT_GROWTH_RATIO = 1.6;
const MAX_TEXT_SHRINK_RATIO = 0.45;
const MAX_ABSOLUTE_GROWTH = 240;

const RECOVERABLE_STRING_KEYS = ["corrected_text", "correctedText", "text", "output_text", "output", "result", "answer"] as const;
const NESTED_OBJECT_KEYS = ["response", "output", "result", "data", "message"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStringField(record: Record<string, unknown>): { field: string; value: string; recovered: boolean } | null {
  const correctedText = record.corrected_text;
  if (typeof correctedText === "string") {
    return {
      field: "corrected_text",
      value: correctedText,
      recovered: false
    };
  }

  for (const field of RECOVERABLE_STRING_KEYS) {
    const candidate = record[field];
    if (typeof candidate === "string") {
      return {
        field,
        value: candidate,
        recovered: field !== "corrected_text"
      };
    }
  }

  const stringEntries = Object.entries(record).filter((entry): entry is [string, string] => typeof entry[1] === "string");
  if (stringEntries.length === 1) {
    return {
      field: stringEntries[0][0],
      value: stringEntries[0][1],
      recovered: true
    };
  }

  for (const field of NESTED_OBJECT_KEYS) {
    const nested = record[field];
    if (!isRecord(nested)) {
      continue;
    }

    const nestedStringField = getStringField(nested);
    if (nestedStringField) {
      return {
        field: `${field}.${nestedStringField.field}`,
        value: nestedStringField.value,
        recovered: true
      };
    }
  }

  return null;
}

function normalizeCorrectedTextValue(correctedText: string, sourceText: string): string {
  if (correctedText.length === 0 && sourceText.length > 0) {
    throw new Error("The language service returned an empty corrected_text.");
  }

  const originalLength = Math.max(1, sourceText.length);
  const correctedLength = correctedText.length;
  const growthRatio = correctedLength / originalLength;
  const shrinkRatio = correctedLength / originalLength;
  const absoluteGrowth = correctedLength - sourceText.length;

  if (growthRatio > MAX_TEXT_GROWTH_RATIO || shrinkRatio < MAX_TEXT_SHRINK_RATIO || absoluteGrowth > MAX_ABSOLUTE_GROWTH) {
    throw new Error("The language service returned an over-broad rewrite.");
  }

  return correctedText;
}

function extractContentPartText(part: unknown): string {
  if (typeof part === "string") {
    return part;
  }

  if (!isRecord(part)) {
    return "";
  }

  if (typeof part.text === "string") {
    return part.text;
  }

  if (typeof part.output_text === "string") {
    return part.output_text;
  }

  return "";
}

/** Flattens provider message content shapes into one text string for JSON recovery. */
export function normalizeMessageContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((part) => extractContentPartText(part)).join("");
  }

  if (isRecord(content)) {
    return extractContentPartText(content);
  }

  return "";
}

function extractJsonObjectText(rawText: string): string | null {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return null;
  }

  // Some providers wrap the JSON object in a fenced markdown block even when asked for plain JSON.
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  // Fall back to the first balanced top-level object while respecting quoted strings so braces inside
  // model prose or escaped JSON text do not truncate the recovered payload.
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index];

    if (escaping) {
      escaping = false;
      continue;
    }

    if (character === "\\") {
      escaping = true;
      continue;
    }

    if (character === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (character === "{") {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
      continue;
    }

    if (character === "}") {
      if (depth === 0) {
        continue;
      }

      depth -= 1;
      if (depth === 0 && start !== -1) {
        return trimmed.slice(start, index + 1);
      }
    }
  }

  return null;
}

function parseJsonObjectText(rawText: string): unknown {
  try {
    return JSON.parse(rawText);
  } catch {
    const extractedJson = extractJsonObjectText(rawText);
    if (!extractedJson || extractedJson === rawText) {
      throw new Error("The language service did not return valid JSON.");
    }

    return JSON.parse(extractedJson);
  }
}

/**
 * Parses provider message content into a validated corrected-text result.
 *
 * String content is first treated as JSON when possible, then falls back to a raw corrected string so
 * smaller models that skip the object wrapper can still produce usable diagnostics and suggestions.
 */
export function parseCorrectedTextContent(content: unknown, sourceText: string): {
  rawContent: string;
  parsed: unknown;
  result: CorrectedTextResult;
} {
  if (isRecord(content)) {
    return {
      rawContent: JSON.stringify(content),
      parsed: content,
      result: normalizeCorrectedTextResponse(content, sourceText)
    };
  }

  const rawContent = normalizeMessageContent(content).trim();
  if (!rawContent) {
    throw new Error("The language service returned an empty response.");
  }

  try {
    const parsed = parseJsonObjectText(rawContent);
    return {
      rawContent,
      parsed,
      result: normalizeCorrectedTextResponse(parsed, sourceText)
    };
  } catch {
    return {
      rawContent,
      parsed: { corrected_text: rawContent },
      result: normalizeCorrectedTextResponse({ corrected_text: rawContent }, sourceText)
    };
  }
}

/**
 * Normalizes a parsed provider response into the extension's corrected-text contract.
 *
 * The response must resolve to a single string field representing the fully corrected active block and
 * must remain close enough to the source text to count as a local grammar edit rather than a rewrite.
 */
export function normalizeCorrectedTextResponse(raw: unknown, sourceText: string): CorrectedTextResult {
  if (!isRecord(raw)) {
    throw new Error("The language service did not return a JSON object.");
  }

  const correctedTextField = getStringField(raw);
  if (!correctedTextField) {
    throw new Error("The language service did not return corrected_text.");
  }

  return {
    correctedText: normalizeCorrectedTextValue(correctedTextField.value, sourceText),
    sourceField: correctedTextField.field,
    recovered: correctedTextField.recovered
  };
}
