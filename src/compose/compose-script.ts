import {
  collectBlocks,
  findActiveBlock,
  getSelectedBlocksSnapshot,
  type BlockInfo,
  type SelectedBlocksSnapshot
} from "./block-extractor";
import { runBlockCheck, runCheck, runSelectedBlocksCheck, type CheckStatus } from "./editor";
import { composeDebugLog } from "./debug-log";
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
    const paused = await browser.runtime.sendMessage({ type: "tab:isPaused", tabId } satisfies RuntimeMessage) as { paused: boolean };
    if (paused.paused) {
      composeDebugLog(activeSettings.debugMode, "compose", "Skipping check because draft is paused", { requestId, tabId });
      setStatusIndicator("Grammar suggestions are paused for this draft.", "paused");
      return;
    }

    composeDebugLog(activeSettings.debugMode, "compose", "Running grammar check", { requestId, tabId });
    setStatusIndicator("Checking grammar in this paragraph...", "checking");
    const result = await runCheck(activeSettings, tabId, requestId, getLatestRequestId, () => scheduleCheck(true));
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

    const currentBlock = currentBlocks.find((block) => block.id === blockSnapshot.id) ?? null;
    if (!currentBlock || currentBlock.text !== blockSnapshot.text) {
      return;
    }

    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }

    const activeSettings = settings;
    const requestId = ++latestRequestId;
    composeDebugLog(activeSettings.debugMode, "compose", "Running immediate previous-paragraph check", {
      requestId,
      tabId,
      blockId: currentBlock.id
    });
    setStatusIndicator("Checking grammar in the previous paragraph...", "checking");
    const result = await runBlockCheck(activeSettings, tabId, requestId, getLatestRequestId, () => scheduleCheck(true), currentBlock);
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

  if (settings.enabled) {
    setStatusIndicator("BYO AI Grammar is on for this draft.", "idle");
  } else {
    setStatusIndicator("BYO AI Grammar is turned off in settings.", "idle");
  }

  observeComposeBodyChanges();

  browser.runtime.onMessage.addListener((message: RuntimeMessage) => {
    if (message.type !== "compose:runSelectedBlocksCheck") {
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
      () => scheduleCheck(true),
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

  await syncSelectionActionState();
  scheduleCheck();
}

bootstrap().catch((error) => {
  console.error("BYO AI Grammar bootstrap failed", error);
  setStatusIndicator("BYO AI Grammar could not start in this compose window.", "error");
});
