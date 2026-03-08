/**
 * Conservative request-size guardrails for compose checks.
 *
 * The add-on does not know the exact context window for every user-supplied model string, so these
 * helpers keep automatic and manual per-paragraph context short.
 */

export const MAX_AUTO_CONTEXT_CHARS = 1800;

/** Joins nearby block text and trims it to the bounded automatic-check context budget. */
export function clampJoinedContext(blockTexts: string[], maxChars = MAX_AUTO_CONTEXT_CHARS): string {
  const joined = blockTexts.join("\n\n");
  return joined.length <= maxChars ? joined : joined.slice(0, maxChars);
}
