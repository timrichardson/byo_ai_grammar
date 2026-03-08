import type { Settings } from "../shared/types";

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  debugMode: true,
  baseUrl: "https://api.together.xyz/v1",
  apiKey: "",
  model: "google/gemma-3n-E4B-it",
  debounceMs: 900,
  customPrompt: "Focus on contemporary standard English with light formality.",
  grammarAllowlist: []
};

function sanitizeStoredSettings(value: unknown): Settings {
  const stored = (value && typeof value === "object") ? value as Partial<Settings> : {};

  return {
    ...DEFAULT_SETTINGS,
    enabled: typeof stored.enabled === "boolean" ? stored.enabled : DEFAULT_SETTINGS.enabled,
    debugMode: typeof stored.debugMode === "boolean" ? stored.debugMode : DEFAULT_SETTINGS.debugMode,
    baseUrl: typeof stored.baseUrl === "string" ? stored.baseUrl : DEFAULT_SETTINGS.baseUrl,
    apiKey: typeof stored.apiKey === "string" ? stored.apiKey : DEFAULT_SETTINGS.apiKey,
    model: typeof stored.model === "string" ? stored.model : DEFAULT_SETTINGS.model,
    debounceMs: typeof stored.debounceMs === "number" ? stored.debounceMs : DEFAULT_SETTINGS.debounceMs,
    customPrompt: typeof stored.customPrompt === "string" ? stored.customPrompt : DEFAULT_SETTINGS.customPrompt,
    grammarAllowlist: Array.isArray(stored.grammarAllowlist)
      ? stored.grammarAllowlist.filter((entry): entry is string => typeof entry === "string")
      : DEFAULT_SETTINGS.grammarAllowlist
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
