import process from "node:process";

import {
  DEFAULT_TIMEOUT_MS,
  analyzeGrammarResponse,
  createRequestBody,
  getApiKeyFromEnv,
  JSON_OBJECT_RESPONSE_FORMAT,
  JSON_SCHEMA_RESPONSE_FORMAT,
  maskApiKey,
  performGrammarRequest,
  resolveEndpoint
} from "./grammar_request_common.mjs";

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    if (key === "help") {
      options.help = true;
      continue;
    }

    const value = argv[index + 1];
    if (typeof value === "undefined" || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    options[key] = value;
    index += 1;
  }

  return options;
}

function printHelp() {
  console.log("Check response_format compatibility for one endpoint/model.");
  console.log("");
  console.log("Required:");
  console.log("  --base-url <url>");
  console.log("  --model <model>");
  console.log("");
  console.log("Optional:");
  console.log("  --active-text <text>");
  console.log("  --context-text <text>");
  console.log(`  --timeout-ms <n>       Timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS})`);
  console.log("");
  console.log("Env:");
  console.log("  BYO_AI_GRAMMAR_API_KEY or TOGETHER_API_KEY or OPENAI_API_KEY");
  console.log("  For localhost endpoints, the script also works with no API key.");
}

function getOptionalApiKey(baseUrl) {
  try {
    return getApiKeyFromEnv();
  } catch {
    const hostname = new URL(baseUrl).hostname;
    if (hostname === "127.0.0.1" || hostname === "localhost") {
      return "";
    }

    throw new Error("Set BYO_AI_GRAMMAR_API_KEY, TOGETHER_API_KEY, or OPENAI_API_KEY before testing this endpoint.");
  }
}

function createBaseRequestBody({ model, activeText, contextText }) {
  return createRequestBody({
    model,
    activeText,
    contextText,
    customPrompt: "",
    grammarAllowlist: []
  });
}

function buildRequestCases(baseRequestBody) {
  return [
    {
      name: "json_object",
      requestBody: {
        ...baseRequestBody,
        response_format: JSON_OBJECT_RESPONSE_FORMAT
      }
    },
    {
      name: "json_schema",
      requestBody: {
        ...baseRequestBody,
        response_format: JSON_SCHEMA_RESPONSE_FORMAT
      }
    },
    {
      name: "text",
      requestBody: {
        ...baseRequestBody,
        response_format: { type: "text" }
      }
    },
    {
      name: "none",
      requestBody: {
        ...baseRequestBody,
        response_format: undefined
      }
    }
  ].map((entry) => ({
    ...entry,
    requestBody: Object.fromEntries(Object.entries(entry.requestBody).filter(([, value]) => typeof value !== "undefined"))
  }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const endpoint = resolveEndpoint(args["base-url"] ?? "");
  const model = (args.model ?? "").trim();
  if (!model) {
    throw new Error("Add --model.");
  }

  const timeoutMs = Number(args["timeout-ms"] ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive number.");
  }

  const activeText = args["active-text"] ?? "These updates is ready to send.";
  const contextText = args["context-text"] ?? "";
  const apiKey = getOptionalApiKey(args["base-url"] ?? endpoint);
  const baseRequestBody = createBaseRequestBody({ model, activeText, contextText });

  console.log(`Endpoint: ${endpoint}`);
  console.log(`Model: ${model}`);
  console.log(`API key: ${apiKey ? maskApiKey(apiKey) : "(none)"}`);
  console.log(`Active text: ${activeText}`);
  console.log("");

  for (const testCase of buildRequestCases(baseRequestBody)) {
    console.log(`CASE: ${testCase.name}`);
    const result = await performGrammarRequest({
      endpoint,
      apiKey,
      requestBody: testCase.requestBody,
      timeoutMs
    });

    if (!result.transportOk) {
      console.log(`transport: error after ${result.bodyElapsedMs}ms`);
      console.log(result.errorMessage);
      console.log("---");
      continue;
    }

    console.log(`status: ${result.status} after ${result.bodyElapsedMs}ms`);
    if (!result.ok) {
      console.log(result.responseText);
      console.log("---");
      continue;
    }

    try {
      const analyzed = analyzeGrammarResponse({
        responseText: result.responseText,
        activeText
      });
      console.log(`parsed: corrected_text=${JSON.stringify(analyzed.correctedText)} needs_change=${String(analyzed.needsChange)}`);
    } catch (error) {
      console.log(`parse-error: ${error instanceof Error ? error.message : String(error)}`);
    }
    console.log(result.responseText);
    console.log("---");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
