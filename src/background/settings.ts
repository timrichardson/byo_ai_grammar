import type { Settings } from "../shared/types";
import { normalizeAllowlistEntries, normalizeCustomPrompt } from "../shared/prompt";

export const SUPPORTED_DEBOUNCE_MS = [500, 900, 1500, 2000] as const;

function normalizeDebounceMs(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && SUPPORTED_DEBOUNCE_MS.includes(value as typeof SUPPORTED_DEBOUNCE_MS[number])
    ? value
    : DEFAULT_SETTINGS.debounceMs;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  debugMode: false,
  baseUrl: "https://api.together.xyz/v1",
  apiKey: "",
  model: "meta-llama/Meta-Llama-3-8B-Instruct-Lite",
  debounceMs: 900,
  customPrompt: "Focus on contemporary standard English with light formality.",
  grammarAllowlist: []
};

export function sanitizeStoredSettings(value: unknown): Settings {
  const stored = (value && typeof value === "object") ? value as Partial<Settings> : {};

  return {
    ...DEFAULT_SETTINGS,
    enabled: typeof stored.enabled === "boolean" ? stored.enabled : DEFAULT_SETTINGS.enabled,
    debugMode: typeof stored.debugMode === "boolean" ? stored.debugMode : DEFAULT_SETTINGS.debugMode,
    baseUrl: typeof stored.baseUrl === "string" ? stored.baseUrl : DEFAULT_SETTINGS.baseUrl,
    apiKey: typeof stored.apiKey === "string" ? stored.apiKey : DEFAULT_SETTINGS.apiKey,
    model: typeof stored.model === "string" ? stored.model : DEFAULT_SETTINGS.model,
    debounceMs: normalizeDebounceMs(stored.debounceMs),
    customPrompt: normalizeCustomPrompt(typeof stored.customPrompt === "string" ? stored.customPrompt : DEFAULT_SETTINGS.customPrompt),
    grammarAllowlist: normalizeAllowlistEntries(Array.isArray(stored.grammarAllowlist)
      ? stored.grammarAllowlist.filter((entry): entry is string => typeof entry === "string")
      : DEFAULT_SETTINGS.grammarAllowlist)
  };
}

export async function getSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get("settings");
  const sanitized = sanitizeStoredSettings(stored.settings);

  if (JSON.stringify(stored.settings ?? null) !== JSON.stringify(sanitized)) {
    await browser.storage.local.set({ settings: sanitized });
  }

  return sanitized;
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ settings: sanitizeStoredSettings(settings) });
}
