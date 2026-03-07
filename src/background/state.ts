import type { CheckResponse } from "../shared/types";

export const pausedTabs = new Set<number>();
export const responseCache = new Map<string, CheckResponse>();

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
