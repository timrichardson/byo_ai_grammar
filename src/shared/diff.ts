import type { GrammarSuggestion } from "./types";

/**
 * Converts a corrected block into bounded local grammar suggestions.
 *
 * The extension asks the model for one corrected paragraph, then diffs token sequences locally so the
 * compose UI can highlight only the changed spans instead of trusting provider-supplied offsets.
 */

type Token = {
  text: string;
  start: number;
  end: number;
};

type DiffOperation =
  | { type: "equal"; original: Token; corrected: Token }
  | { type: "delete"; original: Token }
  | { type: "insert"; corrected: Token };

const TOKEN_PATTERN = /\s+|[^\s\p{L}\p{N}]|[\p{L}\p{N}]+/gu;
const MAX_SUGGESTIONS = 6;

type SuggestionChunk = {
  originalTokens: Token[];
  correctedTokens: Token[];
  anchorOffset: number;
};

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const value = match[0];
    const start = match.index ?? 0;
    tokens.push({
      text: value,
      start,
      end: start + value.length
    });
  }

  if (tokens.length === 0 && text.length > 0) {
    tokens.push({ text, start: 0, end: text.length });
  }

  return tokens;
}

function buildOperations(originalTokens: Token[], correctedTokens: Token[]): DiffOperation[] {
  const dp: number[][] = Array.from({ length: originalTokens.length + 1 }, () => Array<number>(correctedTokens.length + 1).fill(0));

  for (let i = originalTokens.length - 1; i >= 0; i -= 1) {
    for (let j = correctedTokens.length - 1; j >= 0; j -= 1) {
      if (originalTokens[i].text === correctedTokens[j].text) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const operations: DiffOperation[] = [];
  let i = 0;
  let j = 0;

  while (i < originalTokens.length && j < correctedTokens.length) {
    if (originalTokens[i].text === correctedTokens[j].text) {
      operations.push({ type: "equal", original: originalTokens[i], corrected: correctedTokens[j] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      operations.push({ type: "delete", original: originalTokens[i] });
      i += 1;
    } else {
      operations.push({ type: "insert", corrected: correctedTokens[j] });
      j += 1;
    }
  }

  while (i < originalTokens.length) {
    operations.push({ type: "delete", original: originalTokens[i] });
    i += 1;
  }

  while (j < correctedTokens.length) {
    operations.push({ type: "insert", corrected: correctedTokens[j] });
    j += 1;
  }

  return operations;
}

function buildMessage(originalText: string, replacementText: string): string {
  if (!originalText.trim()) {
    return "Consider this grammar insertion.";
  }
  if (!replacementText.trim()) {
    return "Consider removing this grammar error.";
  }
  return "Consider this grammar change.";
}

function isWhitespaceOnlyChange(originalText: string, replacementText: string): boolean {
  return originalText.trim().length === 0 && replacementText.trim().length === 0;
}

function normalizeQuoteVariants(value: string): string {
  return value
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');
}

function isQuoteStyleOnlyChange(originalText: string, replacementText: string): boolean {
  return normalizeQuoteVariants(originalText) === normalizeQuoteVariants(replacementText);
}

function isWhitespaceEqual(operation: DiffOperation): operation is Extract<DiffOperation, { type: "equal" }> {
  return operation.type === "equal" && /^\s+$/u.test(operation.original.text);
}

function buildSuggestionChunks(operations: DiffOperation[]): SuggestionChunk[] {
  const chunks: SuggestionChunk[] = [];
  let cursor = 0;

  while (cursor < operations.length) {
    if (operations[cursor].type === "equal") {
      cursor += 1;
      continue;
    }

    const originalTokens: Token[] = [];
    const correctedTokens: Token[] = [];
    let nextCursor = cursor;

    while (nextCursor < operations.length) {
      const operation = operations[nextCursor];
      if (operation.type === "delete") {
        originalTokens.push(operation.original);
        nextCursor += 1;
        continue;
      }

      if (operation.type === "insert") {
        correctedTokens.push(operation.corrected);
        nextCursor += 1;
        continue;
      }

      let bridgeCursor = nextCursor;
      const bridgeOriginalTokens: Token[] = [];
      const bridgeCorrectedTokens: Token[] = [];
      while (bridgeCursor < operations.length) {
        const equalOperation = operations[bridgeCursor];
        if (!isWhitespaceEqual(equalOperation)) {
          break;
        }

        bridgeOriginalTokens.push(equalOperation.original);
        bridgeCorrectedTokens.push(equalOperation.corrected);
        bridgeCursor += 1;
      }

      // Keep runs of equal whitespace attached to neighboring edits when another non-equal operation
      // follows immediately after them. This preserves natural replacements like spacing plus the word
      // beside it as one suggestion instead of splitting them into separate fragments.
      if (bridgeOriginalTokens.length > 0 && bridgeCursor < operations.length && operations[bridgeCursor].type !== "equal") {
        originalTokens.push(...bridgeOriginalTokens);
        correctedTokens.push(...bridgeCorrectedTokens);
        nextCursor = bridgeCursor;
        continue;
      }

      break;
    }

    const previousOperation = cursor > 0 ? operations[cursor - 1] : null;
    const nextOperation = nextCursor < operations.length ? operations[nextCursor] : null;
    const anchorOffset = originalTokens.length > 0
      ? originalTokens[0].start
      : previousOperation?.type === "equal"
        ? previousOperation.original.end
        : nextOperation?.type === "equal"
          ? nextOperation.original.start
          : 0;

    chunks.push({
      originalTokens,
      correctedTokens,
      anchorOffset
    });
    cursor = nextCursor;
  }

  return chunks;
}

/**
 * Builds user-visible grammar suggestions from one corrected block response.
 *
 * Suggestions stay anchored to the original text, skip whitespace-only changes, and are capped so one
 * noisy model response does not flood the compose UI.
 */
export function buildSuggestionsFromCorrection(originalText: string, correctedText: string, blockId: string): GrammarSuggestion[] {
  if (correctedText === originalText) {
    return [];
  }

  const originalTokens = tokenize(originalText);
  const correctedTokens = tokenize(correctedText);
  const operations = buildOperations(originalTokens, correctedTokens);
  const chunks = buildSuggestionChunks(operations);
  const suggestions: GrammarSuggestion[] = [];

  for (const chunk of chunks) {
    const start = chunk.originalTokens.length > 0 ? chunk.originalTokens[0].start : chunk.anchorOffset;
    const end = chunk.originalTokens.length > 0 ? chunk.originalTokens[chunk.originalTokens.length - 1].end : chunk.anchorOffset;
    const originalChunkText = originalText.slice(start, end);
    const replacementText = chunk.correctedTokens.map((token) => token.text).join("");
    if (
      originalChunkText !== replacementText
      && !isWhitespaceOnlyChange(originalChunkText, replacementText)
      && !isQuoteStyleOnlyChange(originalChunkText, replacementText)
    ) {
      suggestions.push({
        id: `${blockId}:${start}:${end}:${replacementText}`,
        start,
        end,
        originalText: originalChunkText,
        replacementText,
        type: "grammar",
        message: buildMessage(originalChunkText, replacementText),
        suggestions: replacementText ? [replacementText] : []
      });
    }
  }

  return suggestions.slice(0, MAX_SUGGESTIONS);
}
