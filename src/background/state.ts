import type { GrammarSuggestion } from "../shared/types";

export type CachedCheckResult = {
  correctedText: string;
  suggestions: GrammarSuggestion[];
};

/** Per-tab pause state that survives as long as the background page stays alive. */
export const pausedTabs = new Set<number>();
/** Per-tab selection mode state so the compose action can temporarily switch to manual checks. */
export const selectionTabs = new Set<number>();
/** Cache of previously diffed suggestions keyed by request inputs that affect grammar results. */
export const responseCache = new Map<string, CachedCheckResult>();
/** Tracks active request ids per compose tab for debug logging and last-write-wins coordination. */
export const inflightRequests = new Map<number, Set<number>>();

/** Registers an in-flight request and returns the number of active requests for that tab. */
export function registerInflightRequest(tabId: number, requestId: number): number {
  const requestIds = inflightRequests.get(tabId) ?? new Set<number>();
  requestIds.add(requestId);
  inflightRequests.set(tabId, requestIds);
  return requestIds.size;
}

/** Clears one in-flight request and returns the remaining active request count for that tab. */
export function clearInflightRequest(tabId: number, requestId: number): number {
  const requestIds = inflightRequests.get(tabId);
  if (!requestIds) {
    return 0;
  }

  requestIds.delete(requestId);
  if (requestIds.size === 0) {
    inflightRequests.delete(tabId);
    return 0;
  }

  return requestIds.size;
}

/** Clears all tracked in-flight requests for a tab after the compose window closes. */
export function clearTabInflightRequests(tabId: number) {
  inflightRequests.delete(tabId);
}

/** Returns sorted in-flight request ids for debug-friendly logging. */
export function getInflightRequestIds(tabId: number): number[] {
  return Array.from(inflightRequests.get(tabId) ?? []).sort((left, right) => left - right);
}

/** Builds a stable cache key from request inputs that can change suggestion output. */
export function buildCacheKey(input: {
  activeText: string;
  contextText: string;
  model: string;
  baseUrl: string;
  customPrompt: string;
  grammarAllowlist: string[];
}): string {
  return JSON.stringify(input);
}
