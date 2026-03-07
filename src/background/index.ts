import { checkText, testConnection } from "./llm-client";
import { createMenus } from "./menu";
import { registerComposeScript } from "./register-compose-script";
import { getSettings, saveSettings } from "./settings";
import { buildCacheKey, pausedTabs, responseCache } from "./state";
import type { RuntimeMessage } from "../shared/messages";

registerComposeScript();
createMenus();

browser.runtime.onInstalled.addListener(() => {
  createMenus();
});

browser.composeAction.onClicked.addListener(async (tab: { id?: number }) => {
  if (typeof tab.id !== "number") {
    return;
  }

  if (pausedTabs.has(tab.id)) {
    pausedTabs.delete(tab.id);
    await browser.composeAction.setTitle({
      tabId: tab.id,
      title: "Pause BYO AI Grammar for this message"
    });
    await browser.composeAction.setBadgeText({ tabId: tab.id, text: "" });
  } else {
    pausedTabs.add(tab.id);
    await browser.composeAction.setTitle({
      tabId: tab.id,
      title: "Resume BYO AI Grammar for this message"
    });
    await browser.composeAction.setBadgeText({ tabId: tab.id, text: "PAUSE" });
    await browser.composeAction.setBadgeBackgroundColor({ tabId: tab.id, color: "#a61b1b" });
  }
});

browser.menus.onClicked.addListener(async (info: { menuItemId?: string }, tab?: { id?: number }) => {
  if (info.menuItemId === "writing-suggestions-open-settings") {
    await browser.runtime.openOptionsPage();
    return;
  }

  if (info.menuItemId === "writing-suggestions-pause-message" && typeof tab?.id === "number") {
    const paused = !pausedTabs.has(tab.id);
    if (paused) {
      pausedTabs.add(tab.id);
      await browser.composeAction.setBadgeText({ tabId: tab.id, text: "PAUSE" });
      await browser.composeAction.setBadgeBackgroundColor({ tabId: tab.id, color: "#a61b1b" });
    } else {
      pausedTabs.delete(tab.id);
      await browser.composeAction.setBadgeText({ tabId: tab.id, text: "" });
    }
  }
});

browser.runtime.onMessage.addListener((message: RuntimeMessage, sender: { tab?: { id?: number } }) => {
  if (!message || typeof message !== "object") {
    return undefined;
  }

  switch (message.type) {
    case "settings:get":
      return getSettings();
    case "settings:set":
      return saveSettings(message.settings).then(() => ({ ok: true }));
    case "allowlist:add":
      return getSettings().then(async (settings) => {
        const nextSettings = {
          ...settings,
          grammarAllowlist: Array.from(new Set([...settings.grammarAllowlist, message.phrase.trim()])).filter(Boolean)
        };
        await saveSettings(nextSettings);
        responseCache.clear();
        return { ok: true, settings: nextSettings };
      });
    case "connection:test":
      return getSettings().then((settings) => testConnection(settings));
    case "tab:pause": {
      if (message.paused) {
        pausedTabs.add(message.tabId);
      } else {
        pausedTabs.delete(message.tabId);
      }
      return Promise.resolve({ ok: true });
    }
    case "tab:isPaused":
      return Promise.resolve({ paused: pausedTabs.has(message.tabId) });
    case "check:request":
      return getSettings().then(async (settings) => {
        if (!settings.enabled) {
          return {
            ok: false,
            code: "disabled",
            message: "Grammar suggestions are disabled in settings."
          };
        }

        if (pausedTabs.has(message.payload.tabId)) {
          return {
            ok: false,
            code: "paused",
            message: "Grammar suggestions are paused for this message."
          };
        }

        const cacheKey = buildCacheKey({
          activeText: message.payload.activeText,
          contextText: message.payload.contextText,
          model: settings.model,
          baseUrl: settings.baseUrl,
          customPrompt: settings.customPrompt,
          grammarAllowlist: settings.grammarAllowlist
        });
        const cached = responseCache.get(cacheKey);
        if (cached) {
          return cached;
        }

        const response = await checkText(message.payload, settings);
        if (response.ok) {
          responseCache.set(cacheKey, response);
          if (responseCache.size > 40) {
            const firstKey = responseCache.keys().next().value;
            if (firstKey) {
              responseCache.delete(firstKey);
            }
          }
        }
        return response;
      });
    default:
      return undefined;
  }
});
