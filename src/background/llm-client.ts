import { buildPrompt, normalizeAllowlistEntries } from "../shared/prompt";
import { normalizeIssues } from "../shared/validation";
import type { CheckRequest, CheckResponse, ConnectionTestResult, Settings } from "../shared/types";

function normalizeIssueExcerpt(value: string): string {
  return value
    .trim()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function isAllowlisted(text: string, allowlist: string[]): boolean {
  const normalizedText = normalizeIssueExcerpt(text);
  if (!normalizedText) {
    return false;
  }

  return allowlist.some((entry) => normalizeIssueExcerpt(entry) === normalizedText);
}

function resolveEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    throw new Error("Add a Server URL in settings.");
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

async function callService(activeText: string, contextText: string, settings: Settings, signal?: AbortSignal) {
  if (!settings.apiKey.trim()) {
    throw new Error("Add an API key in settings.");
  }
  if (!settings.model.trim()) {
    throw new Error("Add a model in settings.");
  }

  const { system, user } = buildPrompt({
    activeText,
    contextText,
    customPrompt: settings.customPrompt,
    grammarAllowlist: settings.grammarAllowlist
  });
  const response = await fetch(resolveEndpoint(settings.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey.trim()}`
    },
    body: JSON.stringify({
      model: settings.model.trim(),
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    }),
    signal
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Language service error ${response.status}: ${body || response.statusText}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("The language service returned an empty response.");
  }

  const parsed = JSON.parse(content);
  const issues = normalizeIssues(parsed, activeText);
  const allowlist = normalizeAllowlistEntries(settings.grammarAllowlist);
  return issues.filter((issue) => !isAllowlisted(issue.text, allowlist));
}

export async function checkText(payload: CheckRequest, settings: Settings): Promise<CheckResponse> {
  try {
    const issues = await callService(payload.activeText, payload.contextText, settings);
    return {
      ok: true,
      issuesByBlock: {
        [payload.activeBlockId]: issues
      }
    };
  } catch (error) {
    return {
      ok: false,
      code: "service_error",
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function testConnection(settings: Settings): Promise<ConnectionTestResult> {
  try {
    await callService("These updates is ready to send.", "", settings);
    return {
      ok: true,
      message: "Connection succeeded. Your language service returned a valid response."
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}
