import type { Settings } from "../shared/types";

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  baseUrl: "https://api.together.xyz/v1",
  apiKey: "",
  model: "openai/gpt-oss-20b",
  checkCurrentParagraphOnly: false,
  debounceMs: 900,
  customPrompt: "Focus on contemporary standard English with light formality.",
  grammarAllowlist: []
};

export async function getSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get("settings");
  return {
    ...DEFAULT_SETTINGS,
    ...(stored.settings ?? {})
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ settings });
}
