import { DEFAULT_SETTINGS } from "../background/settings";
import { getBuildFingerprint } from "../shared/build-info";
import { debugLog } from "../shared/debug";
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
const version = document.querySelector<HTMLParagraphElement>("#version");

function summarizeSettings(settings: Settings) {
  return {
    enabled: settings.enabled,
    debugMode: settings.debugMode,
    checkCurrentParagraphOnly: settings.checkCurrentParagraphOnly,
    debounceMs: settings.debounceMs,
    baseUrl: settings.baseUrl,
    model: settings.model,
    apiKeyPresent: Boolean(settings.apiKey),
    apiKeyLength: settings.apiKey.length,
    customPromptLength: settings.customPrompt.length,
    grammarAllowlistCount: settings.grammarAllowlist.length
  };
}

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

function showVersion() {
  if (!version) {
    return;
  }

  const manifest = browser.runtime.getManifest();
  version.textContent = `Version ${getBuildFingerprint(manifest.version)}`;
}

function readForm(): Settings {
  const settings = {
    enabled: (document.querySelector<HTMLInputElement>("#enabled")?.checked ?? DEFAULT_SETTINGS.enabled),
    debugMode: (document.querySelector<HTMLInputElement>("#debugMode")?.checked ?? DEFAULT_SETTINGS.debugMode),
    checkCurrentParagraphOnly: document.querySelector<HTMLInputElement>("#checkCurrentParagraphOnly")?.checked ?? DEFAULT_SETTINGS.checkCurrentParagraphOnly,
    debounceMs: Number(document.querySelector<HTMLSelectElement>("#debounceMs")?.value ?? DEFAULT_SETTINGS.debounceMs),
    baseUrl: document.querySelector<HTMLInputElement>("#baseUrl")?.value.trim() ?? DEFAULT_SETTINGS.baseUrl,
    apiKey: document.querySelector<HTMLInputElement>("#apiKey")?.value ?? DEFAULT_SETTINGS.apiKey,
    model: document.querySelector<HTMLInputElement>("#model")?.value.trim() ?? DEFAULT_SETTINGS.model,
    customPrompt: normalizeCustomPrompt(promptEditor?.value ?? DEFAULT_SETTINGS.customPrompt),
    grammarAllowlist: normalizeAllowlistEntries(allowlistEditor?.value ?? DEFAULT_SETTINGS.grammarAllowlist)
  };

  debugLog(settings.debugMode, "options", "Read settings from form", summarizeSettings(settings));
  return settings;
}

function applySettings(settings: Settings) {
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  const enabled = document.querySelector<HTMLInputElement>("#enabled");
  const debugMode = document.querySelector<HTMLInputElement>("#debugMode");
  const paragraphOnly = document.querySelector<HTMLInputElement>("#checkCurrentParagraphOnly");
  const debounce = document.querySelector<HTMLSelectElement>("#debounceMs");
  const baseUrl = document.querySelector<HTMLInputElement>("#baseUrl");
  const apiKey = document.querySelector<HTMLInputElement>("#apiKey");
  const model = document.querySelector<HTMLInputElement>("#model");
  const customPrompt = document.querySelector<HTMLTextAreaElement>("#customPrompt");
  const grammarAllowlist = document.querySelector<HTMLTextAreaElement>("#grammarAllowlist");

  if (enabled) enabled.checked = merged.enabled;
  if (debugMode) debugMode.checked = merged.debugMode;
  if (paragraphOnly) paragraphOnly.checked = merged.checkCurrentParagraphOnly;
  if (debounce) debounce.value = String(merged.debounceMs);
  if (baseUrl) baseUrl.value = merged.baseUrl;
  if (apiKey) apiKey.value = merged.apiKey;
  if (model) model.value = merged.model;
  if (customPrompt) customPrompt.value = merged.customPrompt;
  if (grammarAllowlist) grammarAllowlist.value = merged.grammarAllowlist.join("\n");
  updatePromptCount();
  updateAllowlistCount();
  debugLog(merged.debugMode, "options", "Applied settings to options UI", summarizeSettings(merged));
}

async function restore() {
  const settings = await browser.runtime.sendMessage({ type: "settings:get" } satisfies RuntimeMessage) as Settings;
  debugLog(settings.debugMode, "options", "Restored settings from storage", summarizeSettings(settings));
  applySettings(settings);
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Saving settings...");
  const settings = readForm();
  debugLog(settings.debugMode, "options", "Saving settings", summarizeSettings(settings));
  await browser.runtime.sendMessage({ type: "settings:set", settings } satisfies RuntimeMessage);
  setStatus("Settings saved.", "success");
});

testButton?.addEventListener("click", async () => {
  setStatus("Testing connection...");
  const settings = readForm();
  debugLog(settings.debugMode, "options", "Testing connection with settings", summarizeSettings(settings));
  await browser.runtime.sendMessage({ type: "settings:set", settings } satisfies RuntimeMessage);
  const result = await browser.runtime.sendMessage({ type: "connection:test" } satisfies RuntimeMessage) as { ok: boolean; message: string };
  setStatus(result.message, result.ok ? "success" : "error");
});

promptEditor?.addEventListener("input", updatePromptCount);
allowlistEditor?.addEventListener("input", updateAllowlistCount);

restore().catch((error) => {
  console.error(error);
  setStatus("Unable to load settings.", "error");
});

showVersion();
