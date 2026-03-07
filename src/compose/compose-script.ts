import { runCheck } from "./editor";
import type { RuntimeMessage } from "../shared/messages";
import type { Settings } from "../shared/types";

let settings: Settings | null = null;
let tabId = -1;
let timer: number | null = null;

function scheduleCheck() {
  if (!settings || tabId < 0) {
    return;
  }
  if (timer !== null) {
    window.clearTimeout(timer);
  }
  timer = window.setTimeout(async () => {
    const paused = await browser.runtime.sendMessage({ type: "tab:isPaused", tabId } satisfies RuntimeMessage) as { paused: boolean };
    if (!paused.paused) {
      await runCheck(settings as Settings, tabId);
    }
  }, settings.debounceMs);
}

async function bootstrap() {
  settings = await browser.runtime.sendMessage({ type: "settings:get" } satisfies RuntimeMessage) as Settings;
  const tab = await browser.tabs.getCurrent();
  tabId = tab?.id ?? -1;

  document.addEventListener("input", () => {
    scheduleCheck();
  }, true);

  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest("#writing-suggestions-popup, #writing-suggestions-overlay")) {
      const popup = document.getElementById("writing-suggestions-popup") as HTMLElement | null;
      if (popup) {
        popup.hidden = true;
      }
    }
  }, true);

  scheduleCheck();
}

bootstrap().catch((error) => {
  console.error("Writing suggestions bootstrap failed", error);
});
