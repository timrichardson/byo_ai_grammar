import process from "node:process";

export const DEFAULT_TIMEOUT_MS = 60000;

const BASE_SYSTEM_PROMPT = [
  "You are a grammar checker for email composition.",
  "Return exactly one JSON object.",
  "The JSON object must contain exactly one key: corrected_text.",
  "Do not return markdown, code fences, commentary, or extra keys.",
  "Target contemporary standard English with light formality.",
  "Keep suggestions conservative and practical for everyday professional email.",
  "Ignore spelling mistakes. Thunderbird handles spelling separately.",
  "Correct clearly wrong function-word choices and homophone confusions only when the sentence is grammatically wrong in context, such as to/too/two, their/there/they're, your/you're, and its/it's.",
  "Do not rewrite tone or style beyond what is needed for correctness.",
  "Preserve names, product names, quoted text, and meaning.",
  "corrected_text must be the full corrected version of active_text.",
  "If active_text is already acceptable, return active_text unchanged.",
  "Only make small grammar corrections that can be applied locally."
];

const MAX_TEXT_GROWTH_RATIO = 1.6;
const MAX_TEXT_SHRINK_RATIO = 0.45;
const MAX_ABSOLUTE_GROWTH = 240;
const RECOVERABLE_STRING_KEYS = ["corrected_text", "correctedText", "text", "output_text", "output", "result", "answer"];
const NESTED_OBJECT_KEYS = ["response", "output", "result", "data", "message"];

function normalizeWhitespace(value) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeCustomPrompt(value) {
  return normalizeWhitespace(value).slice(0, 600);
}

export function normalizeAllowlistEntries(values) {
  const rawValues = values.flatMap((value) => value.split(/\r?\n|\|/));
  const unique = new Set();
  const normalized = [];
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
    if (normalized.length >= 50 || nextTotal > 800) {
      break;
    }

    unique.add(dedupeKey);
    normalized.push(entry);
    totalChars = nextTotal;
  }

  return normalized;
}

export function buildPrompt({ activeText, contextText, customPrompt = "", grammarAllowlist = [] }) {
  const normalizedCustomPrompt = normalizeCustomPrompt(customPrompt);
  const allowlist = normalizeAllowlistEntries(grammarAllowlist);
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
      active_text: activeText,
      nearby_context: contextText
    })
  };
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStringField(record) {
  if (typeof record.corrected_text === "string") {
    return {
      field: "corrected_text",
      value: record.corrected_text,
      recovered: false
    };
  }

  for (const field of RECOVERABLE_STRING_KEYS) {
    if (typeof record[field] === "string") {
      return {
        field,
        value: record[field],
        recovered: field !== "corrected_text"
      };
    }
  }

  const stringEntries = Object.entries(record).filter((entry) => typeof entry[1] === "string");
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

function extractContentPartText(part) {
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

function normalizeMessageContent(content) {
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

function extractJsonObjectText(rawText) {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return null;
  }

  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

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

function parseJsonObjectText(rawText) {
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

export function resolveEndpoint(baseUrl) {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    throw new Error("Add --base-url.");
  }

  if (trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }

  if (trimmed.endsWith("/v1")) {
    return `${trimmed}/chat/completions`;
  }

  if (trimmed.endsWith("/")) {
    return `${trimmed}v1/chat/completions`;
  }

  return `${trimmed}/chat/completions`;
}

export function elapsedMs(startedAt) {
  return Date.now() - startedAt;
}

export function maskApiKey(value) {
  if (!value) {
    return "";
  }

  if (value.length <= 8) {
    return `${value.slice(0, 2)}***`;
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function getApiKeyFromEnv() {
  const apiKey = process.env.BYO_AI_GRAMMAR_API_KEY ?? process.env.TOGETHER_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
  if (!apiKey) {
    throw new Error("Set BYO_AI_GRAMMAR_API_KEY, TOGETHER_API_KEY, or OPENAI_API_KEY before running this script.");
  }

  return apiKey;
}

export function createRequestBody({ model, activeText, contextText, customPrompt = "", grammarAllowlist = [] }) {
  const { system, user } = buildPrompt({
    activeText,
    contextText,
    customPrompt,
    grammarAllowlist
  });

  return {
    model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ]
  };
}

export async function performGrammarRequest({
  endpoint,
  apiKey,
  requestBody,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  const controller = new AbortController();
  let timedOut = false;
  const startedAt = Date.now();
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("Request timed out."));
  }, timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    const headersElapsedMs = elapsedMs(startedAt);
    const responseText = await response.text();
    return {
      transportOk: true,
      timedOut,
      status: response.status,
      ok: response.ok,
      headersElapsedMs,
      bodyElapsedMs: elapsedMs(startedAt),
      responseText,
      responseBodyBytes: responseText.length
    };
  } catch (error) {
    return {
      transportOk: false,
      timedOut,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      bodyElapsedMs: elapsedMs(startedAt)
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export function normalizeCorrectedTextResponse(raw, sourceText) {
  if (!isRecord(raw)) {
    throw new Error("The language service did not return a JSON object.");
  }

  const correctedTextField = getStringField(raw);
  if (!correctedTextField) {
    throw new Error("The language service did not return corrected_text.");
  }

  const correctedText = correctedTextField.value;
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

  return {
    correctedText,
    sourceField: correctedTextField.field,
    recovered: correctedTextField.recovered
  };
}

export function analyzeGrammarResponse({ responseText, activeText }) {
  const payload = JSON.parse(responseText);
  const content = payload?.choices?.[0]?.message?.parsed ?? payload?.choices?.[0]?.message?.content;
  if (isRecord(content)) {
    const normalized = normalizeCorrectedTextResponse(content, activeText);
    return {
      payload,
      content: JSON.stringify(content),
      parsedContent: content,
      correctedText: normalized.correctedText,
      sourceField: normalized.sourceField,
      recovered: normalized.recovered
    };
  }

  const normalizedContent = normalizeMessageContent(content).trim();
  if (!normalizedContent) {
    throw new Error("The language service returned an empty response.");
  }

  let parsedContent;
  try {
    parsedContent = parseJsonObjectText(normalizedContent);
  } catch {
    parsedContent = { corrected_text: normalizedContent };
  }

  const normalized = normalizeCorrectedTextResponse(parsedContent, activeText);
  return {
    payload,
    content: normalizedContent,
    parsedContent,
    correctedText: normalized.correctedText,
    sourceField: normalized.sourceField,
    recovered: normalized.recovered
  };
}
