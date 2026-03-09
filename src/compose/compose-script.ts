import {
  collectBlocks,
  findActiveBlock,
  getSelectedBlocksSnapshot,
  type BlockInfo,
  type SelectedBlocksSnapshot
} from "./block-extractor";
import { resetIgnoredSuggestions, runBlockCheck, runSelectedBlocksCheck, type CheckStatus } from "./editor";
import { composeDebugLog } from "./debug-log";
import { setHighlightDebugLogging } from "./highlights";
import { setStatusIndicator } from "./status-indicator";
import { getBuildFingerprint } from "../shared/build-info";
import { formatStartupPrefix } from "../shared/debug";
import type { RuntimeMessage } from "../shared/messages";
import type { Settings } from "../shared/types";

let settings: Settings | null = null;
let tabId = -1;
let timer: number | null = null;
let latestRequestId = 0;
let bodyObserver: MutationObserver | null = null;
let bodySnapshotPoller: number | null = null;
let lastObservedBodyText = "";
let latestSelectionSnapshot: SelectedBlocksSnapshot | null = null;
let pendingEnterParagraphCheck: number | null = null;
const latestAutomaticRequestIdByParagraphKey = new Map<string, number>();

function getLatestRequestId() {
  return latestRequestId;
}

async function syncSelectionActionState() {
  if (tabId < 0) {
    return;
  }

  latestSelectionSnapshot = getSelectedBlocksSnapshot();
  await browser.runtime.sendMessage({
    type: "tab:selection",
    tabId,
    hasSelection: latestSelectionSnapshot !== null
  } satisfies RuntimeMessage);
}

async function syncIgnoredActionState(hasIgnoredSuggestions = false) {
  if (tabId < 0) {
    return;
  }

  await browser.runtime.sendMessage({
    type: "tab:ignored",
    tabId,
    hasIgnoredSuggestions
  } satisfies RuntimeMessage);
}

function getBodyTextSnapshot(): string {
  return (document.body?.innerText ?? "").replace(/\r/g, "");
}

function scheduleCheckIfBodyChanged() {
  const nextBodyText = getBodyTextSnapshot();
  if (nextBodyText === lastObservedBodyText) {
    return;
  }

  lastObservedBodyText = nextBodyText;
  scheduleCheck();
}

function scheduleCheck(immediate = false) {
  if (!settings || tabId < 0) {
    return;
  }

  const activeSettings = settings;

  if (!activeSettings.enabled) {
    setStatusIndicator("BYO AI Grammar is turned off in settings.", "idle");
    return;
  }

  if (timer !== null) {
    window.clearTimeout(timer);
  }

  const requestId = ++latestRequestId;
  const delay = immediate ? 0 : activeSettings.debounceMs;

  composeDebugLog(activeSettings.debugMode, "compose", "Scheduled grammar check", {
    requestId,
    tabId,
    immediate,
    delay
  });

  timer = window.setTimeout(async () => {
    const currentBlocks = collectBlocks();
    const activeBlock = findActiveBlock(currentBlocks);
    if (!activeBlock || !activeBlock.text) {
      composeDebugLog(activeSettings.debugMode, "compose", "No active paragraph available when scheduled check fired", { requestId, tabId });
      setStatusIndicator("BYO AI Grammar is on. Start typing to check this draft.", "idle");
      return;
    }

    const paused = await browser.runtime.sendMessage({ type: "tab:isPaused", tabId } satisfies RuntimeMessage) as { paused: boolean };
    if (paused.paused) {
      composeDebugLog(activeSettings.debugMode, "compose", "Skipping check because draft is paused", { requestId, tabId });
      setStatusIndicator("Grammar suggestions are paused for this draft.", "paused");
      return;
    }

    latestAutomaticRequestIdByParagraphKey.set(activeBlock.paragraphKey, requestId);

    composeDebugLog(activeSettings.debugMode, "compose:request-lane", "Running automatic paragraph check", {
      requestId,
      source: "current-paragraph",
      tabId,
      paragraphKey: activeBlock.paragraphKey,
      blockId: activeBlock.id,
      latestLaneRequestId: latestAutomaticRequestIdByParagraphKey.get(activeBlock.paragraphKey) ?? null
    });
    setStatusIndicator("Checking grammar in this paragraph...", "checking");
    const result = await runBlockCheck(
      activeSettings,
      tabId,
      requestId,
      (paragraphKey: string) => latestAutomaticRequestIdByParagraphKey.get(paragraphKey),
      scheduleFreshCheck,
      activeBlock,
      "current-paragraph"
    );
    if (!result.stale && requestId === latestRequestId) {
      setStatusIndicator(result.message, result.state);
      composeDebugLog(activeSettings.debugMode, "compose", "Applied grammar check result", {
        requestId,
        state: result.state,
        message: result.message
      });
    } else {
      composeDebugLog(activeSettings.debugMode, "compose", "Dropped stale grammar check result", { requestId, latestRequestId });
      if (requestId === latestRequestId) {
        setStatusIndicator("Waiting for a stable paragraph before showing grammar suggestions...", "checking");
      }
    }
  }, delay);
}

function scheduleFreshCheck(target?: { paragraphKey: string; blockId: string }) {
  if (target) {
    void recheckParagraphImmediately(target);
    return;
  }

  scheduleCheck(true);
}

async function recheckParagraphImmediately(target: { paragraphKey: string; blockId: string }) {
  if (!settings || tabId < 0 || !settings.enabled) {
    return;
  }

  const activeSettings = settings;
  lastObservedBodyText = getBodyTextSnapshot();
  const currentBlocks = collectBlocks();
  const currentBlock = currentBlocks.find((block) => block.id === target.blockId)
    ?? currentBlocks.find((block) => block.paragraphKey === target.paragraphKey)
    ?? findActiveBlock(currentBlocks);
  if (!currentBlock || !currentBlock.text.trim()) {
    composeDebugLog(activeSettings.debugMode, "compose:block-remap", "Unable to recheck paragraph immediately after apply", {
      paragraphKey: target.paragraphKey,
      blockId: target.blockId,
      reason: currentBlock ? "empty_text" : "paragraph_missing"
    });
    scheduleCheck(true);
    return;
  }

  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }

  const requestId = ++latestRequestId;
  latestAutomaticRequestIdByParagraphKey.set(currentBlock.paragraphKey, requestId);
  composeDebugLog(activeSettings.debugMode, "compose:request-lane", "Running immediate paragraph recheck after apply", {
    requestId,
    source: "current-paragraph",
    tabId,
    paragraphKey: currentBlock.paragraphKey,
    blockId: currentBlock.id,
    latestLaneRequestId: latestAutomaticRequestIdByParagraphKey.get(currentBlock.paragraphKey) ?? null
  });
  setStatusIndicator("Refreshing grammar suggestions in this paragraph...", "checking");
  const result = await runBlockCheck(
    activeSettings,
    tabId,
    requestId,
    (nextParagraphKey: string) => latestAutomaticRequestIdByParagraphKey.get(nextParagraphKey),
    scheduleFreshCheck,
    currentBlock,
    "current-paragraph"
  );
  if (!result.stale && requestId === latestRequestId) {
    setStatusIndicator(result.message, result.state);
  }
}

function schedulePreviousParagraphCheck(blockSnapshot: BlockInfo) {
  if (!settings || tabId < 0 || !settings.enabled) {
    return;
  }

  if (pendingEnterParagraphCheck !== null) {
    window.clearTimeout(pendingEnterParagraphCheck);
  }

  pendingEnterParagraphCheck = window.setTimeout(async () => {
    pendingEnterParagraphCheck = null;
    if (!settings || tabId < 0 || !settings.enabled) {
      return;
    }

    lastObservedBodyText = getBodyTextSnapshot();
    const currentBlocks = collectBlocks();
    const currentActiveBlock = findActiveBlock(currentBlocks);
    if (currentActiveBlock?.id === blockSnapshot.id) {
      return;
    }

    const currentBlock = currentBlocks.find((block) => block.paragraphKey === blockSnapshot.paragraphKey) ?? null;
    if (!currentBlock || currentBlock.text !== blockSnapshot.text) {
      composeDebugLog(settings.debugMode, "compose:block-remap", "Previous paragraph no longer maps cleanly after Enter", {
        previousParagraphKey: blockSnapshot.paragraphKey,
        previousBlockId: blockSnapshot.id,
        previousTextLength: blockSnapshot.text.length,
        reason: currentBlock ? "text_changed" : "paragraph_missing"
      });
      return;
    }

    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }

    const activeSettings = settings;
    const requestId = ++latestRequestId;
    latestAutomaticRequestIdByParagraphKey.set(currentBlock.paragraphKey, requestId);
    composeDebugLog(activeSettings.debugMode, "compose:request-lane", "Running immediate previous-paragraph check", {
      requestId,
      source: "previous-paragraph",
      tabId,
      paragraphKey: currentBlock.paragraphKey,
      blockId: currentBlock.id,
      latestLaneRequestId: latestAutomaticRequestIdByParagraphKey.get(currentBlock.paragraphKey) ?? null
    });
    setStatusIndicator("Checking grammar in the previous paragraph...", "checking");
    const result = await runBlockCheck(
      activeSettings,
      tabId,
      requestId,
      (paragraphKey: string) => latestAutomaticRequestIdByParagraphKey.get(paragraphKey),
      scheduleFreshCheck,
      currentBlock,
      "previous-paragraph"
    );
    if (!result.stale && requestId === latestRequestId) {
      setStatusIndicator(result.message, result.state);
      composeDebugLog(activeSettings.debugMode, "compose", "Applied previous-paragraph check result", {
        requestId,
        state: result.state,
        message: result.message
      });
    }
  }, 0);
}

function observeComposeBodyChanges() {
  bodyObserver?.disconnect();
  if (bodySnapshotPoller !== null) {
    window.clearInterval(bodySnapshotPoller);
  }
  if (!document.body) {
    return;
  }

  /**
   * Thunderbird paste and some editor commands do not reliably emit input events to the compose script.
   * Watch the compose body directly so pasted or programmatic text changes still start the normal debounce.
   */
  bodyObserver = new MutationObserver((mutations) => {
    if (mutations.length === 0) {
      return;
    }

    scheduleCheck();
  });

  bodyObserver.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true
  });

  // Thunderbird compose sometimes updates visible editor text without surfacing reliable DOM
  // events or mutation records to the extension script. Poll a cheap visible-text snapshot as a
  // backstop so pasted text still starts the normal debounce window.
  lastObservedBodyText = getBodyTextSnapshot();
  bodySnapshotPoller = window.setInterval(() => {
    scheduleCheckIfBodyChanged();
  }, 400);
}

async function bootstrap() {
  const manifest = browser.runtime.getManifest();
  console.info(`${formatStartupPrefix()} Compose startup ${getBuildFingerprint(manifest.version)}`);

  settings = await browser.runtime.sendMessage({ type: "settings:get" } satisfies RuntimeMessage) as Settings;
  const currentTab = await browser.runtime.sendMessage({ type: "tab:getCurrent" } satisfies RuntimeMessage) as { tabId: number | null };
  tabId = currentTab.tabId ?? -1;

  if (tabId < 0) {
    throw new Error("The compose script could not determine the current compose tab.");
  }

  composeDebugLog(settings.debugMode, "compose", "Compose script bootstrapped", {
    tabId,
    debounceMs: settings.debounceMs
  });
  setHighlightDebugLogging(settings.debugMode);

  if (settings.enabled) {
    setStatusIndicator("BYO AI Grammar is on for this draft.", "idle");
  } else {
    setStatusIndicator("BYO AI Grammar is turned off in settings.", "idle");
  }

  observeComposeBodyChanges();

  browser.runtime.onMessage.addListener((message: RuntimeMessage) => {
    if (message.type !== "compose:runSelectedBlocksCheck") {
      if (message.type === "compose:resetIgnoredSuggestions") {
        if (tabId < 0) {
          return Promise.resolve({ handled: false });
        }

        void resetIgnoredSuggestions(tabId, scheduleFreshCheck);
        return Promise.resolve({ handled: true });
      }

      return undefined;
    }

    if (!settings || tabId < 0) {
      return Promise.resolve({ handled: false });
    }

    const selectionSnapshot = getSelectedBlocksSnapshot() ?? latestSelectionSnapshot;
    if (!selectionSnapshot) {
      void syncSelectionActionState();
      return Promise.resolve({ handled: false });
    }

    if (!settings.enabled) {
      setStatusIndicator("BYO AI Grammar is turned off in settings.", "idle");
      return Promise.resolve({ handled: true });
    }

    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }

    setStatusIndicator("Checking selected paragraphs...", "checking");
    void runSelectedBlocksCheck(
      settings,
      tabId,
      selectionSnapshot,
      () => ++latestRequestId,
      getLatestRequestId,
      scheduleFreshCheck,
      (message: string) => setStatusIndicator(message, "checking")
    )
      .then((result: CheckStatus) => {
        if (!result.stale) {
          setStatusIndicator(result.message, result.state);
        }
      })
      .finally(() => {
        void syncSelectionActionState();
      });

    return Promise.resolve({ handled: true });
  });

  document.addEventListener("input", () => {
    scheduleCheck();
    void syncSelectionActionState();
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    const activeBlock = findActiveBlock(collectBlocks());
    if (!activeBlock || !activeBlock.text.trim()) {
      return;
    }

    schedulePreviousParagraphCheck(activeBlock);
  }, true);

  // Thunderbird compose sometimes updates the editor on paste without reliably surfacing
  // a later input event to the extension, so treat paste like a typing change here.
  document.addEventListener("paste", () => {
    window.setTimeout(() => scheduleCheck(), 0);
    window.setTimeout(() => {
      void syncSelectionActionState();
    }, 0);
  }, true);

  document.addEventListener("selectionchange", () => {
    void syncSelectionActionState();
  }, true);

  document.addEventListener("click", (event) => {
    void syncSelectionActionState();
    const target = event.target as HTMLElement | null;
    if (!target?.closest("#writing-suggestions-popup, #writing-suggestions-overlay")) {
      const popup = document.getElementById("writing-suggestions-popup") as HTMLElement | null;
      if (popup) {
        popup.hidden = true;
      }
    }
  }, true);

  await syncIgnoredActionState(false);
  await syncSelectionActionState();
  scheduleCheck();
}

bootstrap().catch((error) => {
  console.error("BYO AI Grammar bootstrap failed", error);
  setStatusIndicator("BYO AI Grammar could not start in this compose window.", "error");
});
