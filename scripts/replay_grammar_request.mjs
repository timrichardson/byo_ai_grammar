import process from "node:process";

import { DEFAULT_TIMEOUT_MS, createRequestBody, elapsedMs, getApiKeyFromEnv, maskApiKey, performGrammarRequest, resolveEndpoint } from "./grammar_request_common.mjs";

function parseArgs(argv) {
  const options = {
    allowlist: []
  };

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

    if (key === "print-payload") {
      options.printPayload = true;
      continue;
    }

    const value = argv[index + 1];
    if (typeof value === "undefined" || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    index += 1;
    if (key === "allowlist") {
      options.allowlist.push(value);
      continue;
    }

    options[key] = value;
  }

  return options;
}

function printHelp() {
  console.log("Replay one BYO AI Grammar request outside Thunderbird.");
  console.log("");
  console.log("Required:");
  console.log("  --base-url <url>");
  console.log("  --model <model>");
  console.log("");
  console.log("Optional:");
  console.log("  --active-text <text>");
  console.log("  --context-text <text>");
  console.log("  --custom-prompt <text>");
  console.log("  --allowlist <value>    Repeat to add allowlist entries");
  console.log(`  --timeout-ms <n>       Timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS})`);
  console.log("  --print-payload");
  console.log("");
  console.log("Env:");
  console.log("  BYO_AI_GRAMMAR_API_KEY or TOGETHER_API_KEY or OPENAI_API_KEY");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const apiKey = getApiKeyFromEnv();

  const activeText = args["active-text"] ?? "These updates is ready to send.";
  const contextText = args["context-text"] ?? activeText;
  const model = (args.model ?? "").trim();
  if (!model) {
    throw new Error("Add --model.");
  }

  const endpoint = resolveEndpoint(args["base-url"] ?? "");
  const timeoutMs = Number(args["timeout-ms"] ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive number.");
  }

  const requestBody = createRequestBody({
    model,
    activeText,
    contextText,
    customPrompt: args["custom-prompt"] ?? "",
    grammarAllowlist: args.allowlist
  });

  if (args["print-payload"]) {
    console.log("Request payload:");
    console.log(JSON.stringify(requestBody, null, 2));
  }

  console.log(`Sending request to ${endpoint}`);
  console.log(`Model: ${model}`);
  console.log(`API key: ${maskApiKey(apiKey)}`);
  console.log(`Active text: ${activeText}`);
  console.log(`Context text: ${contextText}`);
  console.log(`Body bytes: ${JSON.stringify(requestBody).length}`);

  const result = await performGrammarRequest({
    endpoint,
    apiKey,
    requestBody,
    timeoutMs
  });

  if (result.transportOk) {
    console.log(`Response headers after ${result.headersElapsedMs}ms: ${result.status}`);
    console.log(`Response body after ${result.bodyElapsedMs}ms (${result.responseBodyBytes} chars)`);
    console.log(result.responseText);
  } else {
    console.error(`Request failed after ${result.bodyElapsedMs}ms`);
    console.error(`Timed out: ${result.timedOut}`);
    console.error(result.errorMessage);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
