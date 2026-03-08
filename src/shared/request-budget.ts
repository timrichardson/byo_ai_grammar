/**
 * Conservative request-size guardrails for compose checks.
 *
 * The add-on does not know the exact context window for every user-supplied model string, so these
 * helpers keep automatic context short and bound manual selection checks to a smaller, safer budget.
 */

export const MAX_AUTO_CONTEXT_CHARS = 1800;
export const MAX_SELECTED_TEXT_CHARS = 4000;
export const MAX_SELECTED_CONTEXT_CHARS = 600;

/** Joins nearby block text and trims it to the bounded automatic-check context budget. */
export function clampJoinedContext(blockTexts: string[], maxChars = MAX_AUTO_CONTEXT_CHARS): string {
  const joined = blockTexts.join("\n\n");
  return joined.length <= maxChars ? joined : joined.slice(0, maxChars);
}

function trimFromStart(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : value.slice(value.length - maxChars);
}

function trimFromEnd(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : value.slice(0, maxChars);
}

/**
 * Builds a short before-and-after context snippet around a manual text selection.
 *
 * This gives the model a little nearby compose context without sending the whole draft or risking a
 * very large user selection plus surrounding text overflowing smaller published model windows.
 */
export function buildSelectedTextContext(
  bodyText: string,
  startOffset: number,
  endOffset: number,
  maxChars = MAX_SELECTED_CONTEXT_CHARS
): string {
  const beforeBudget = Math.floor(maxChars / 2);
  const afterBudget = maxChars - beforeBudget;
  const before = trimFromStart(bodyText.slice(0, startOffset), beforeBudget).trim();
  const after = trimFromEnd(bodyText.slice(endOffset), afterBudget).trim();

  return [before, after].filter(Boolean).join("\n\n");
}
