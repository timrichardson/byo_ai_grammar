import { buildSuggestionsFromCorrection } from "../shared/diff";
import { debugLog } from "../shared/debug";
import { buildPrompt, normalizeAllowlistEntries } from "../shared/prompt";
import { parseCorrectedTextContent } from "../shared/validation";
import type { CheckRequest, CheckResponse, ConnectionTestResult, GrammarSuggestion, Settings } from "../shared/types";

const REQUEST_TIMEOUT_MS = 60000;
const JSON_SCHEMA_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "grammar_response",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["needs_change", "corrected_text"],
      properties: {
        needs_change: { type: "boolean" },
        corrected_text: { type: "string" }
      }
    }
  }
} as const;
const JSON_OBJECT_RESPONSE_FORMAT = { type: "json_object" } as const;

type ConnectionTestCase = {
  name: string;
  activeText: string;
  contextText: string;
  expectChange: boolean;
  expectedText?: string;
};

const CONNECTION_TEST_CASES: ConnectionTestCase[] = [
  {
    name: "fix-simple",
    activeText: "These updates is ready to send.",
    contextText: "",
    expectChange: true,
    expectedText: "These updates are ready to send."
  },
  {
    name: "keep-good",
    activeText: "These updates are ready to send.",
    contextText: "",
    expectChange: false,
    expectedText: "These updates are ready to send."
  },
  {
    name: "fix-short",
    activeText: "This findings are useful.",
    contextText: "",
    expectChange: true,
    expectedText: "These findings are useful."
  }
];

type ConnectionTestCaseResult = {
  name: string;
  ok: boolean;
  activeText: string;
  expectation: string;
  detail: string;
};

function formatConnectionTestMessage(caseResults: ConnectionTestCaseResult[]): string {
  const passedCount = caseResults.filter((result) => result.ok).length;
  const summary = `${passedCount}/${caseResults.length} checks passed`;
  const details = caseResults.map((result) => `${result.name}: ${result.ok ? "ok" : result.detail}`).join("; ");
  return `${summary}. ${details}`;
}

function createTimeoutSignal(signal?: AbortSignal): { signal: AbortSignal; cleanup: () => void; didTimeOut: () => boolean } {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("Request timed out."));
  }, REQUEST_TIMEOUT_MS);

  const abortFromParent = () => {
    controller.abort(signal?.reason ?? new Error("Request aborted."));
  };

  if (signal) {
    if (signal.aborted) {
      abortFromParent();
    } else {
      signal.addEventListener("abort", abortFromParent, { once: true });
    }
  }

  return {
    signal: controller.signal,
    didTimeOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", abortFromParent);
    }
  };
}

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

function isLocalhostEndpoint(baseUrl: string): boolean {
  try {
    const hostname = new URL(baseUrl.trim()).hostname;
    return hostname === "127.0.0.1" || hostname === "localhost";
  } catch {
    return false;
  }
}

function resolveApiKey(settings: Settings): string {
  const savedKey = settings.apiKey.trim();
  if (!savedKey) {
    if (isLocalhostEndpoint(settings.baseUrl)) {
      return "";
    }
    throw new Error("Add an API key in settings.");
  }
  return savedKey;
}

function elapsedMs(startedAt: number): number {
  return Date.now() - startedAt;
}

function supportsJsonSchemaFallback(status: number, responseText: string): boolean {
  if (status !== 400) {
    return false;
  }

  const normalized = responseText.toLowerCase();
  return normalized.includes("response_format") && normalized.includes("json_object");
}

async function callService(activeText: string, contextText: string, settings: Settings, signal?: AbortSignal) {
  if (!settings.model.trim()) {
    throw new Error("Add a model in settings.");
  }

  const apiKey = resolveApiKey(settings);
  const endpoint = resolveEndpoint(settings.baseUrl);
  const startedAt = Date.now();
  const { system, user } = buildPrompt({
    activeText,
    contextText,
    customPrompt: settings.customPrompt,
    grammarAllowlist: settings.grammarAllowlist
  });
  const baseRequestBody = {
    model: settings.model.trim(),
    temperature: 0,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ]
  };
  const requestFormats = [
    { name: "json_schema", responseFormat: JSON_SCHEMA_RESPONSE_FORMAT },
    { name: "json_object", responseFormat: JSON_OBJECT_RESPONSE_FORMAT }
  ] as const;

  // Keep one local timeout signal that still honors caller cancellation so stale compose requests can
  // stop network work promptly without giving up the extension-wide 60 second transport guardrail.
  const timeout = createTimeoutSignal(signal);
  try {
    let responseText = "";
    let activeFormatName: "json_schema" | "json_object" = "json_schema";
    let response: Response | null = null;

    for (const format of requestFormats) {
      const requestBody = {
        ...baseRequestBody,
        response_format: format.responseFormat
      };

      debugLog(settings.debugMode, "background:llm", "Sending grammar request", {
        endpoint,
        activeTextLength: activeText.length,
        contextTextLength: contextText.length,
        model: settings.model.trim(),
        responseFormat: format.name,
        requestBodyBytes: JSON.stringify(requestBody).length
      });

      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify(requestBody),
        signal: timeout.signal
      });

      debugLog(settings.debugMode, "background:llm", "Received grammar response headers", {
        endpoint,
        elapsedMs: elapsedMs(startedAt),
        status: response.status,
        ok: response.ok,
        responseFormat: format.name
      });

      responseText = await response.text();

      debugLog(settings.debugMode, "background:llm", "Received grammar response body", {
        endpoint,
        elapsedMs: elapsedMs(startedAt),
        status: response.status,
        bodyLength: responseText.length,
        responseFormat: format.name
      });

      if (response.ok) {
        activeFormatName = format.name;
        break;
      }

      if (format.name === "json_schema" && supportsJsonSchemaFallback(response.status, responseText)) {
        debugLog(settings.debugMode, "background:llm", "Retrying grammar request with json_object fallback", {
          endpoint,
          status: response.status,
          responseFormat: format.name
        });
        continue;
      }

      throw new Error(`Language service error ${response.status}: ${responseText || response.statusText}`);
    }

    if (!response?.ok) {
      throw new Error(`Language service error ${response?.status ?? "unknown"}: ${responseText}`);
    }

    const payload = JSON.parse(responseText);
    const message = payload?.choices?.[0]?.message;
    let normalized;
    let rawContent = "";
    let parsed;
    try {
      // Prefer structured provider output when available, but fall back to message content because
      // OpenAI-compatible services differ on whether they expose parsed JSON separately.
      const parsedContent = parseCorrectedTextContent(message?.parsed ?? message?.content, activeText);
      rawContent = parsedContent.rawContent;
      parsed = parsedContent.parsed;
      normalized = parsedContent.result;
    } catch (error) {
      debugLog(settings.debugMode, "background:llm", "Malformed corrected_text response", {
        rawContent,
        parsed,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }

    if (normalized.recovered) {
      debugLog(settings.debugMode, "background:llm", "Recovered corrected_text from non-standard response", {
        sourceField: normalized.sourceField,
        correctedTextLength: normalized.correctedText.length
      });
    }

    debugLog(settings.debugMode, "background:llm", "Received corrected_text response", {
      elapsedMs: elapsedMs(startedAt),
      responseFormat: activeFormatName,
      sourceField: normalized.sourceField,
      recovered: normalized.recovered,
      correctedTextLength: normalized.correctedText.length,
      changed: normalized.correctedText !== activeText
    });
    return normalized;
  } catch (error) {
    debugLog(settings.debugMode, "background:llm", "Grammar transport failure", {
      endpoint,
      elapsedMs: elapsedMs(startedAt),
      timedOut: timeout.didTimeOut(),
      parentAborted: Boolean(signal?.aborted),
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error)
    });

    if (timeout.didTimeOut()) {
      throw new Error("The language service did not respond within 60 seconds.");
    }

    throw error;
  } finally {
    timeout.cleanup();
  }
}

function filterSuggestions(suggestions: GrammarSuggestion[], allowlist: string[]): GrammarSuggestion[] {
  return suggestions.filter((suggestion) => !isAllowlisted(suggestion.originalText, allowlist));
}

/**
 * Sends one grammar check to the configured language service and returns local suggestions.
 *
 * This keeps spelling out of scope, applies prompt allowlist rules, validates the returned
 * `corrected_text`, and rebuilds bounded local suggestions by diffing the corrected block against the
 * original active text.
 */
export async function checkText(payload: CheckRequest, settings: Settings, signal?: AbortSignal): Promise<CheckResponse> {
  try {
    const result = await callService(payload.activeText, payload.contextText, settings, signal);
    const suggestions = filterSuggestions(
      buildSuggestionsFromCorrection(payload.activeText, result.correctedText, payload.activeBlockId),
      normalizeAllowlistEntries(settings.grammarAllowlist)
    );

    debugLog(settings.debugMode, "background:llm", "Built local grammar suggestions", {
      requestId: payload.requestId,
      suggestionCount: suggestions.length,
      fragments: suggestions.map((suggestion) => ({
        id: suggestion.id,
        start: suggestion.start,
        end: suggestion.end,
        originalText: suggestion.originalText,
        replacementText: suggestion.replacementText
      }))
    });

    return {
      ok: true,
      requestId: payload.requestId,
      correctedTextByBlock: {
        [payload.activeBlockId]: result.correctedText
      },
      suggestionsByBlock: {
        [payload.activeBlockId]: suggestions
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    debugLog(settings.debugMode, "background:llm", "Grammar request failed", {
      requestId: payload.requestId,
      message
    });
    const lowerMessage = message.toLowerCase();
    return {
      ok: false,
      requestId: payload.requestId,
      code: lowerMessage.includes("abort") ? "aborted" : "service_error",
      message: lowerMessage.includes("timed out") ? "The language service did not respond within 60 seconds." : message
    };
  }
}

/**
 * Performs a lightweight connection test against the configured provider.
 *
 * The sample sentence intentionally contains a small grammar mistake so the check exercises the same
 * `corrected_text` validation path used during normal compose requests.
 */
export async function testConnection(settings: Settings): Promise<ConnectionTestResult> {
  try {
    const caseResults: ConnectionTestCaseResult[] = [];
    for (const testCase of CONNECTION_TEST_CASES) {
      const result = await callService(testCase.activeText, testCase.contextText, settings);
      const changed = result.correctedText !== testCase.activeText;
      const ok = typeof testCase.expectedText === "string"
        ? result.correctedText === testCase.expectedText
        : changed === testCase.expectChange;
      caseResults.push({
        name: testCase.name,
        ok,
        activeText: testCase.activeText,
        expectation: testCase.expectChange ? "should change" : "should stay unchanged",
        detail: ok
          ? result.correctedText
          : typeof testCase.expectedText === "string"
            ? `returned \"${result.correctedText}\"; expected \"${testCase.expectedText}\"`
            : testCase.expectChange
              ? `did not correct the sample sentence (returned \"${result.correctedText}\")`
              : `changed text that should stay unchanged (returned \"${result.correctedText}\")`
      });
    }

    return {
      ok: caseResults.every((result) => result.ok),
      message: formatConnectionTestMessage(caseResults),
      caseResults
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      message: message.toLowerCase().includes("timed out")
        ? "Connection test timed out after 60 seconds. Check the server URL, model, or network connection."
        : message
    };
  }
}
