import { checkText, testConnection } from "./llm-client";
import { createMenus } from "./menu";
import { registerComposeScript } from "./register-compose-script";
import { getSettings, sanitizeStoredSettings, saveSettings } from "./settings";
import { normalizeAllowlistEntries } from "../shared/prompt";
import { buildCacheKey, clearInflightRequest, clearTabInflightRequests, getInflightRequestIds, pausedTabs, registerInflightRequest, responseCache, selectionTabs } from "./state";
import { getBuildFingerprint } from "../shared/build-info";
import { debugLog, formatDebugPrefix, formatStartupPrefix } from "../shared/debug";
import type { RuntimeMessage } from "../shared/messages";

const manifest = browser.runtime.getManifest();
console.info(`${formatStartupPrefix()} Background startup ${getBuildFingerprint(manifest.version)}`);

const ACTIVE_COMPOSE_ACTION_ICON = {
  16: "icons/icon-16.svg",
  32: "icons/icon-32.svg",
  64: "icons/icon-64.svg",
  128: "icons/icon-128.svg"
} as const;

const PAUSED_COMPOSE_ACTION_ICON = {
  16: "icons/icon-paused-16.svg",
  32: "icons/icon-paused-32.svg",
  64: "icons/icon-paused-64.svg",
  128: "icons/icon-paused-128.svg"
} as const;

async function syncComposeAction(tabId: number) {
  const paused = pausedTabs.has(tabId);
  const hasSelection = selectionTabs.has(tabId);

  await browser.composeAction.setLabel({
    tabId,
    label: paused ? "Off" : hasSelection ? "Check" : "On"
  });
  await browser.composeAction.setTitle({
    tabId,
    title: paused
      ? "Resume grammar suggestions for this draft"
      : hasSelection
        ? "Check the selected paragraphs"
        : "Pause grammar suggestions for this draft"
  });
  await browser.composeAction.setIcon({
    tabId,
    path: paused ? PAUSED_COMPOSE_ACTION_ICON : ACTIVE_COMPOSE_ACTION_ICON
  });
  await browser.composeAction.setBadgeText({ tabId, text: paused ? "" : hasSelection ? "Sel" : "" });
}

void browser.composeAction.setLabel({ label: "On" });

registerComposeScript();
createMenus();

browser.runtime.onInstalled.addListener(() => {
  createMenus();
});

browser.tabs.onRemoved.addListener((tabId: number) => {
  pausedTabs.delete(tabId);
  selectionTabs.delete(tabId);
  clearTabInflightRequests(tabId);
});

browser.composeAction.onClicked.addListener(async (tab: { id?: number }) => {
  if (typeof tab.id !== "number") {
    return;
  }

  if (selectionTabs.has(tab.id) && !pausedTabs.has(tab.id)) {
    try {
      const response = await browser.tabs.sendMessage(tab.id, { type: "compose:runSelectedBlocksCheck" } satisfies RuntimeMessage) as { handled: boolean };
      if (response?.handled) {
        return;
      }
    } catch (error) {
      console.error("Unable to trigger selected-paragraph grammar check", error);
    }

    selectionTabs.delete(tab.id);
    await syncComposeAction(tab.id);
    return;
  }

  const paused = !pausedTabs.has(tab.id);
  if (paused) {
    pausedTabs.add(tab.id);
  } else {
    pausedTabs.delete(tab.id);
  }
  await syncComposeAction(tab.id);
});

browser.menus.onClicked.addListener(async (info: { menuItemId?: string | number }, tab?: browser.tabs.Tab) => {
  if (info.menuItemId === "writing-suggestions-open-settings") {
    await browser.runtime.openOptionsPage();
    return;
  }

  if (info.menuItemId === "writing-suggestions-pause-message" && typeof tab?.id === "number") {
    const paused = !pausedTabs.has(tab.id);
    if (paused) {
      pausedTabs.add(tab.id);
    } else {
      pausedTabs.delete(tab.id);
    }
    await syncComposeAction(tab.id);
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
    case "debug:log":
      if (typeof message.details === "undefined") {
        console.info(`${formatDebugPrefix(`compose-mirror:${message.scope}`)} ${message.message}`);
      } else {
        console.info(`${formatDebugPrefix(`compose-mirror:${message.scope}`)} ${message.message}`, message.details);
      }
      return Promise.resolve({ ok: true });
    case "allowlist:add":
      return getSettings().then(async (settings) => {
        const nextSettings = {
          ...settings,
          grammarAllowlist: normalizeAllowlistEntries([...settings.grammarAllowlist, message.phrase])
        };
        await saveSettings(nextSettings);
        responseCache.clear();
        return { ok: true, settings: nextSettings };
      });
    case "connection:test":
      return message.settings
        ? testConnection(sanitizeStoredSettings(message.settings))
        : getSettings().then((settings) => testConnection(settings));
    case "tab:getCurrent":
      if (typeof sender.tab?.id === "number") {
        void syncComposeAction(sender.tab.id);
      }
      return Promise.resolve({ tabId: typeof sender.tab?.id === "number" ? sender.tab.id : null });
    case "tab:pause": {
      if (message.paused) {
        pausedTabs.add(message.tabId);
      } else {
        pausedTabs.delete(message.tabId);
      }
      void syncComposeAction(message.tabId);
      return Promise.resolve({ ok: true });
    }
    case "tab:isPaused":
      return Promise.resolve({ paused: pausedTabs.has(message.tabId) });
    case "tab:selection":
      if (message.hasSelection) {
        selectionTabs.add(message.tabId);
      } else {
        selectionTabs.delete(message.tabId);
      }
      void syncComposeAction(message.tabId);
      return Promise.resolve({ ok: true });
    case "check:request":
      return getSettings().then(async (settings) => {
        debugLog(settings.debugMode, "background", "Received check request", {
          requestId: message.payload.requestId,
          tabId: message.payload.tabId,
          activeBlockId: message.payload.activeBlockId,
          activeTextLength: message.payload.activeText.length
        });

        if (!settings.enabled) {
          return {
            ok: false,
            requestId: message.payload.requestId,
            code: "disabled",
            message: "Grammar suggestions are disabled in settings."
          };
        }

        if (pausedTabs.has(message.payload.tabId)) {
          return {
            ok: false,
            requestId: message.payload.requestId,
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
          debugLog(settings.debugMode, "background", "Serving cached suggestions", {
            requestId: message.payload.requestId,
            suggestionCount: cached.suggestions.length
          });
          return {
            ok: true,
            requestId: message.payload.requestId,
            correctedTextByBlock: {
              [message.payload.activeBlockId]: cached.correctedText
            },
            suggestionsByBlock: {
              [message.payload.activeBlockId]: cached.suggestions
            }
          };
        }

        const existingInflightRequestIds = getInflightRequestIds(message.payload.tabId).filter(
          (requestId) => requestId !== message.payload.requestId
        );
        if (existingInflightRequestIds.length > 0) {
          debugLog(settings.debugMode, "background", "Leaving older in-flight requests running", {
            requestId: message.payload.requestId,
            tabId: message.payload.tabId,
            inflightRequestIds: existingInflightRequestIds
          });
        }

        const inflightCount = registerInflightRequest(message.payload.tabId, message.payload.requestId);
        debugLog(settings.debugMode, "background", "Registered in-flight request", {
          requestId: message.payload.requestId,
          tabId: message.payload.tabId,
          inflightCount
        });

        const response = await checkText(message.payload, settings);
        const remainingInflightCount = clearInflightRequest(message.payload.tabId, message.payload.requestId);
        debugLog(settings.debugMode, "background", "Cleared in-flight request", {
          requestId: message.payload.requestId,
          tabId: message.payload.tabId,
          remainingInflightCount
        });

        debugLog(settings.debugMode, "background", "Completed check request", {
          requestId: message.payload.requestId,
          ok: response.ok,
          code: response.ok ? undefined : response.code,
          suggestionCount: response.ok ? (response.suggestionsByBlock[message.payload.activeBlockId] ?? []).length : 0
        });

        if (response.ok) {
          responseCache.set(cacheKey, {
            correctedText: response.correctedTextByBlock[message.payload.activeBlockId] ?? message.payload.activeText,
            suggestions: response.suggestionsByBlock[message.payload.activeBlockId] ?? []
          });
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
