import { getBuildFingerprint } from "../shared/build-info";

type IndicatorState = "idle" | "checking" | "success" | "paused" | "error";

const STYLE_ID = "byo-ai-grammar-status-style";
const INDICATOR_ID = "byo-ai-grammar-status";

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${INDICATOR_ID} {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 2147483647;
      max-width: min(360px, calc(100vw - 32px));
      padding: 10px 14px;
      border-radius: 999px;
      border: 1px solid rgba(15, 23, 42, 0.12);
      background: rgba(255, 252, 246, 0.96);
      color: #102a43;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
      font: 13px/1.3 "IBM Plex Sans", "Segoe UI", sans-serif;
      pointer-events: none;
    }

    #${INDICATOR_ID}[data-state="checking"] {
      background: rgba(229, 246, 243, 0.98);
      color: #0b5246;
    }

    #${INDICATOR_ID}[data-state="success"] {
      background: rgba(241, 245, 249, 0.98);
      color: #102a43;
    }

    #${INDICATOR_ID}[data-state="paused"] {
      background: rgba(255, 244, 229, 0.98);
      color: #8d2b0b;
    }

    #${INDICATOR_ID}[data-state="error"] {
      background: rgba(255, 236, 236, 0.98);
      color: #a61b1b;
    }
  `;
  document.head.appendChild(style);
}

function ensureIndicator() {
  ensureStyles();
  const manifest = browser.runtime.getManifest();
  const buildFingerprint = getBuildFingerprint(manifest.version);

  let indicator = document.getElementById(INDICATOR_ID) as HTMLDivElement | null;
  if (!indicator) {
    indicator = document.createElement("div");
    indicator.id = INDICATOR_ID;
    indicator.dataset.state = "idle";
    indicator.textContent = `BYO AI Grammar is on. Build ${buildFingerprint}.`;
    document.documentElement.appendChild(indicator);
  }

  indicator.title = `Build ${buildFingerprint}`;

  return indicator;
}

/** Updates the floating compose status pill without touching the editable message body. */
export function setStatusIndicator(message: string, state: IndicatorState) {
  const indicator = ensureIndicator();
  indicator.dataset.state = state;
  indicator.textContent = message;
}
