import { DEFAULT_SETTINGS } from "../background/settings";
import {
  MAX_CUSTOM_PROMPT_CHARS,
  MAX_ALLOWLIST_ENTRIES,
  normalizeAllowlistEntries,
  normalizeCustomPrompt
} from "../shared/prompt";
import type { RuntimeMessage } from "../shared/messages";
import type { Settings } from "../shared/types";

const form = document.querySelector<HTMLFormElement>("#settings-form");
const status = document.querySelector<HTMLParagraphElement>("#status");
const testButton = document.querySelector<HTMLButtonElement>("#test-connection");
const promptEditor = document.querySelector<HTMLTextAreaElement>("#customPrompt");
const promptCount = document.querySelector<HTMLParagraphElement>("#prompt-count");
const allowlistEditor = document.querySelector<HTMLTextAreaElement>("#grammarAllowlist");
const allowlistCount = document.querySelector<HTMLParagraphElement>("#allowlist-count");

function setStatus(message: string, state: "idle" | "success" | "error" = "idle") {
  if (!status) {
    return;
  }
  status.textContent = message;
  status.dataset.state = state;
}

function updatePromptCount() {
  if (!promptEditor || !promptCount) {
    return;
  }

  const value = normalizeCustomPrompt(promptEditor.value);
  if (promptEditor.value !== value) {
    promptEditor.value = value;
  }
  promptCount.textContent = `${value.length}/${MAX_CUSTOM_PROMPT_CHARS} characters`;
}

function updateAllowlistCount() {
  if (!allowlistEditor || !allowlistCount) {
    return;
  }

  const entries = normalizeAllowlistEntries(allowlistEditor.value);
  allowlistEditor.value = entries.join("\n");
  allowlistCount.textContent = `${entries.length}/${MAX_ALLOWLIST_ENTRIES} approved phrases`;
}

function readForm(): Settings {
  return {
    enabled: (document.querySelector<HTMLInputElement>("#enabled")?.checked ?? DEFAULT_SETTINGS.enabled),
    checkCurrentParagraphOnly: document.querySelector<HTMLInputElement>("#checkCurrentParagraphOnly")?.checked ?? DEFAULT_SETTINGS.checkCurrentParagraphOnly,
    debounceMs: Number(document.querySelector<HTMLSelectElement>("#debounceMs")?.value ?? DEFAULT_SETTINGS.debounceMs),
    baseUrl: document.querySelector<HTMLInputElement>("#baseUrl")?.value.trim() ?? DEFAULT_SETTINGS.baseUrl,
    apiKey: document.querySelector<HTMLInputElement>("#apiKey")?.value ?? DEFAULT_SETTINGS.apiKey,
    model: document.querySelector<HTMLInputElement>("#model")?.value.trim() ?? DEFAULT_SETTINGS.model,
    customPrompt: normalizeCustomPrompt(promptEditor?.value ?? DEFAULT_SETTINGS.customPrompt),
    grammarAllowlist: normalizeAllowlistEntries(allowlistEditor?.value ?? DEFAULT_SETTINGS.grammarAllowlist)
  };
}

function applySettings(settings: Settings) {
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  const enabled = document.querySelector<HTMLInputElement>("#enabled");
  const paragraphOnly = document.querySelector<HTMLInputElement>("#checkCurrentParagraphOnly");
  const debounce = document.querySelector<HTMLSelectElement>("#debounceMs");
  const baseUrl = document.querySelector<HTMLInputElement>("#baseUrl");
  const apiKey = document.querySelector<HTMLInputElement>("#apiKey");
  const model = document.querySelector<HTMLInputElement>("#model");
  const customPrompt = document.querySelector<HTMLTextAreaElement>("#customPrompt");
  const grammarAllowlist = document.querySelector<HTMLTextAreaElement>("#grammarAllowlist");

  if (enabled) enabled.checked = merged.enabled;
  if (paragraphOnly) paragraphOnly.checked = merged.checkCurrentParagraphOnly;
  if (debounce) debounce.value = String(merged.debounceMs);
  if (baseUrl) baseUrl.value = merged.baseUrl;
  if (apiKey) apiKey.value = merged.apiKey;
  if (model) model.value = merged.model;
  if (customPrompt) customPrompt.value = merged.customPrompt;
  if (grammarAllowlist) grammarAllowlist.value = merged.grammarAllowlist.join("\n");
  updatePromptCount();
  updateAllowlistCount();
}

async function restore() {
  const settings = await browser.runtime.sendMessage({ type: "settings:get" } satisfies RuntimeMessage) as Settings;
  applySettings(settings);
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Saving settings...");
  await browser.runtime.sendMessage({ type: "settings:set", settings: readForm() } satisfies RuntimeMessage);
  setStatus("Settings saved.", "success");
});

testButton?.addEventListener("click", async () => {
  setStatus("Testing connection...");
  await browser.runtime.sendMessage({ type: "settings:set", settings: readForm() } satisfies RuntimeMessage);
  const result = await browser.runtime.sendMessage({ type: "connection:test" } satisfies RuntimeMessage) as { ok: boolean; message: string };
  setStatus(result.message, result.ok ? "success" : "error");
});

promptEditor?.addEventListener("input", updatePromptCount);
allowlistEditor?.addEventListener("input", updateAllowlistCount);

restore().catch((error) => {
  console.error(error);
  setStatus("Unable to load settings.", "error");
});
