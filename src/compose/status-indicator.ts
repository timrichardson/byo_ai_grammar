type IndicatorState = "idle" | "checking" | "success" | "paused" | "error";

const STYLE_ID = "byo-ai-grammar-status-style";
const LEGACY_INDICATOR_ID = "byo-ai-grammar-status";
const STATUS_MESSAGE_ATTRIBUTE = "data-byo-ai-grammar-status";
const STATUS_STATE_ATTRIBUTE = "data-byo-ai-grammar-status-state";

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    html[${STATUS_MESSAGE_ATTRIBUTE}]::after {
      content: attr(${STATUS_MESSAGE_ATTRIBUTE});
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
      white-space: normal;
    }

    html[${STATUS_STATE_ATTRIBUTE}="checking"]::after {
      background: rgba(229, 246, 243, 0.98);
      color: #0b5246;
    }

    html[${STATUS_STATE_ATTRIBUTE}="success"]::after {
      background: rgba(241, 245, 249, 0.98);
      color: #102a43;
    }

    html[${STATUS_STATE_ATTRIBUTE}="paused"]::after {
      background: rgba(255, 244, 229, 0.98);
      color: #8d2b0b;
    }

    html[${STATUS_STATE_ATTRIBUTE}="error"]::after {
      background: rgba(255, 236, 236, 0.98);
      color: #a61b1b;
    }
  `;
  document.head.appendChild(style);
}

function removeLegacyIndicatorNode() {
  document.getElementById(LEGACY_INDICATOR_ID)?.remove();
}

/**
 * Updates the floating compose status pill without inserting user-visible text nodes into the draft DOM.
 *
 * Thunderbird can serialize stray compose-window text nodes into the outgoing message, so render the
 * pill with CSS-generated content on the root element and scrub any older light-DOM indicator node.
 */
export function setStatusIndicator(message: string, state: IndicatorState) {
  ensureStyles();
  removeLegacyIndicatorNode();

  const root = document.documentElement;
  if (!message.trim()) {
    root.removeAttribute(STATUS_MESSAGE_ATTRIBUTE);
    root.removeAttribute(STATUS_STATE_ATTRIBUTE);
    return;
  }

  root.setAttribute(STATUS_MESSAGE_ATTRIBUTE, message);
  root.setAttribute(STATUS_STATE_ATTRIBUTE, state);
}
