import process from "node:process";

import { DEFAULT_TIMEOUT_MS, analyzeGrammarResponse, createRequestBody, getApiKeyFromEnv, performGrammarRequest, resolveEndpoint } from "./grammar_request_common.mjs";

const DEFAULT_MODELS = [
  "arcee-ai/trinity-mini",
  "google/gemma-3n-E4B-it",
  "Qwen/Qwen2.5-7B-Instruct-Turbo",
  "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
  "mistralai/Mistral-Small-24B-Instruct-2501",
  "openai/gpt-oss-20b"
];

const DEFAULT_CASES = [
  {
    name: "fix-simple",
    activeText: "These updates is ready to send.",
    contextText: "",
    expectChange: true
  },
  {
    name: "keep-good",
    activeText: "These updates are ready to send.",
    contextText: "",
    expectChange: false
  },
  {
    name: "fix-short",
    activeText: "This findings are useful.",
    contextText: "",
    expectChange: true
  }
];

function parseArgs(argv) {
  const options = {
    model: [],
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

    const value = argv[index + 1];
    if (typeof value === "undefined" || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    index += 1;
    if (key === "model") {
      options.model.push(value);
      continue;
    }
    if (key === "allowlist") {
      options.allowlist.push(value);
      continue;
    }

    options[key] = value;
  }

  return options;
}

function printHelp() {
  console.log("Benchmark candidate Together chat models for BYO AI Grammar.");
  console.log("");
  console.log("Required:");
  console.log("  --base-url <url>");
  console.log("");
  console.log("Optional:");
  console.log("  --model <model>        Repeat to override the default candidate list");
  console.log("  --runs <n>             Number of runs per case per model (default: 2)");
  console.log(`  --timeout-ms <n>       Timeout per request in milliseconds (default: ${DEFAULT_TIMEOUT_MS})`);
  console.log("  --custom-prompt <text> Extra prompt instructions");
  console.log("  --allowlist <value>    Repeat to add allowlist entries");
  console.log("");
  console.log("Env:");
  console.log("  BYO_AI_GRAMMAR_API_KEY or TOGETHER_API_KEY or OPENAI_API_KEY");
}

function average(values) {
  if (values.length === 0) {
    return null;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function pushCount(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function formatCountMap(map) {
  if (map.size === 0) {
    return "-";
  }

  return Array.from(map.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key, count]) => `${key}:${count}`)
    .join(", ");
}

function evaluateCase(result, testCase) {
  if (!result.transportOk) {
    return {
      contractOk: false,
      expectationOk: false,
      failure: result.timedOut ? "timeout" : `transport:${result.errorName ?? "unknown"}`,
      latencyMs: result.bodyElapsedMs,
      details: result.errorMessage
    };
  }

  if (!result.ok) {
    return {
      contractOk: false,
      expectationOk: false,
      failure: `http:${result.status}`,
      latencyMs: result.bodyElapsedMs,
      details: result.responseText
    };
  }

  try {
    const analyzed = analyzeGrammarResponse({
      responseText: result.responseText,
      activeText: testCase.activeText
    });
    const changed = analyzed.correctedText !== testCase.activeText;
    const expectationOk = changed === testCase.expectChange;

    return {
      contractOk: true,
      expectationOk,
      failure: expectationOk ? null : testCase.expectChange ? "did-not-correct" : "changed-good-text",
      latencyMs: result.bodyElapsedMs,
      details: analyzed.correctedText
    };
  } catch (error) {
    return {
      contractOk: false,
      expectationOk: false,
      failure: "invalid-corrected-text",
      latencyMs: result.bodyElapsedMs,
      details: error instanceof Error ? error.message : String(error)
    };
  }
}

async function benchmarkModel({ endpoint, apiKey, model, timeoutMs, runs, customPrompt, allowlist }) {
  const failures = new Map();
  const sampleFailures = [];
  const latencies = [];
  let contractPasses = 0;
  let expectationPasses = 0;
  let attempts = 0;

  for (let runIndex = 0; runIndex < runs; runIndex += 1) {
    for (const testCase of DEFAULT_CASES) {
      attempts += 1;
      const requestBody = createRequestBody({
        model,
        activeText: testCase.activeText,
        contextText: testCase.contextText,
        customPrompt,
        grammarAllowlist: allowlist
      });

      const requestResult = await performGrammarRequest({
        endpoint,
        apiKey,
        requestBody,
        timeoutMs
      });
      const evaluation = evaluateCase(requestResult, testCase);
      latencies.push(evaluation.latencyMs);
      if (evaluation.contractOk) {
        contractPasses += 1;
      }
      if (evaluation.expectationOk) {
        expectationPasses += 1;
      }
      if (evaluation.failure) {
        pushCount(failures, evaluation.failure);
        if (sampleFailures.length < 3) {
          sampleFailures.push(`${testCase.name}: ${evaluation.details}`);
        }
      }

      process.stdout.write(
        `${model} run ${runIndex + 1}/${runs} case ${testCase.name}: ${evaluation.failure ?? "ok"} (${evaluation.latencyMs}ms)\n`
      );
    }
  }

  return {
    model,
    attempts,
    contractPasses,
    expectationPasses,
    averageLatencyMs: average(latencies),
    failures: formatCountMap(failures),
    sampleFailures
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const endpoint = resolveEndpoint(args["base-url"] ?? "");
  const models = args.model.length > 0 ? args.model : DEFAULT_MODELS;
  const runs = Number(args.runs ?? 2);
  const timeoutMs = Number(args["timeout-ms"] ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isInteger(runs) || runs <= 0) {
    throw new Error("--runs must be a positive integer.");
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive number.");
  }

  const apiKey = getApiKeyFromEnv();
  const customPrompt = args["custom-prompt"] ?? "";

  console.log(`Endpoint: ${endpoint}`);
  console.log(`Runs per case: ${runs}`);
  console.log(`Cases: ${DEFAULT_CASES.map((testCase) => testCase.name).join(", ")}`);
  console.log(`Models: ${models.join(", ")}`);
  console.log("");

  const summaries = [];
  for (const model of models) {
    summaries.push(await benchmarkModel({
      endpoint,
      apiKey,
      model,
      timeoutMs,
      runs,
      customPrompt,
      allowlist: args.allowlist
    }));
    console.log("");
  }

  console.log("Summary");
  console.log("model | contract | expected | avg_ms | failures");
  console.log("--- | --- | --- | --- | ---");
  for (const summary of summaries) {
    console.log(
      `${summary.model} | ${summary.contractPasses}/${summary.attempts} | ${summary.expectationPasses}/${summary.attempts} | ${summary.averageLatencyMs ?? "-"} | ${summary.failures}`
    );
    for (const sampleFailure of summary.sampleFailures) {
      console.log(`  sample: ${sampleFailure}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
