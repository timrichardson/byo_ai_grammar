import { createRangeForOffsets } from "./range-mapper";
import type { SuggestionIssue } from "../shared/types";

type HighlightRecord = {
  issue: SuggestionIssue;
  range: Range;
  buttons: HTMLButtonElement[];
};

const OVERLAY_ID = "writing-suggestions-overlay";
const STYLE_ID = "writing-suggestions-style";
const records = new Map<string, HighlightRecord>();
let overlay: HTMLDivElement | null = null;

function ensureOverlay() {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${OVERLAY_ID} {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 2147483646;
      }

      .ws-highlight {
        position: absolute;
        pointer-events: auto;
        background: transparent;
        border: 0;
        padding: 0;
        margin: 0;
        cursor: pointer;
      }

      .ws-highlight::after {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        border-bottom-width: 2px;
        border-bottom-style: solid;
      }

      .ws-highlight[data-issue-type="grammar"]::after {
        border-bottom-color: #1769aa;
        border-bottom-style: dotted;
      }
    `;
    document.head.appendChild(style);
  }

  overlay = document.getElementById(OVERLAY_ID) as HTMLDivElement | null;
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    document.documentElement.appendChild(overlay);
  }
  return overlay;
}

export function clearHighlights() {
  ensureOverlay().replaceChildren();
  records.clear();
}

export function renderHighlights(
  blockElement: HTMLElement,
  blockId: string,
  issues: SuggestionIssue[],
  onActivate: (issueId: string, anchorRect: DOMRect) => void
) {
  const root = ensureOverlay();
  for (const issue of issues) {
    const range = createRangeForOffsets(blockElement, issue.offset, issue.offset + issue.length);
    if (!range) {
      continue;
    }

    const issueId = `${blockId}:${issue.offset}:${issue.length}`;
    const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 1 && rect.height > 1);
    const buttons: HTMLButtonElement[] = [];

    for (const rect of rects) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ws-highlight";
      button.dataset.issueType = issue.type;
      button.style.left = `${rect.left + window.scrollX}px`;
      button.style.top = `${rect.top + window.scrollY}px`;
      button.style.width = `${rect.width}px`;
      button.style.height = `${rect.height}px`;
      button.title = issue.message;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onActivate(issueId, rect);
      });
      root.appendChild(button);
      buttons.push(button);
    }

    if (buttons.length > 0) {
      records.set(issueId, { issue, range: range.cloneRange(), buttons });
    }
  }
}

export function getHighlightRecord(issueId: string): HighlightRecord | null {
  return records.get(issueId) ?? null;
}
