import { createRangeForOffsets } from "./range-mapper";
import { debugLog } from "../shared/debug";
import type { GrammarSuggestion } from "../shared/types";

/** Overlay-backed highlight record for one active grammar suggestion. */
type HighlightRecord = {
  issue: GrammarSuggestion;
  range: Range;
  buttons: HTMLButtonElement[];
};

type HighlightRenderGroup = {
  blockElement: HTMLElement;
  issues: GrammarSuggestion[];
  onActivate: (issueId: string, anchorRect: DOMRect) => void;
};

const OVERLAY_ID = "writing-suggestions-overlay";
const STYLE_ID = "writing-suggestions-style";
const records = new Map<string, HighlightRecord>();
const renderGroups: HighlightRenderGroup[] = [];
let overlay: HTMLDivElement | null = null;
let refreshQueued = false;
let listenersAttached = false;
let highlightDebugLoggingEnabled = false;

export function setHighlightDebugLogging(enabled: boolean) {
  highlightDebugLoggingEnabled = enabled;
}

function getIssueRects(range: Range): DOMRect[] {
  const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 1 && rect.height > 1);
  if (rects.length > 0) {
    return rects;
  }

  const fallbackRect = range.getBoundingClientRect();
  if (fallbackRect.height <= 1) {
    return [];
  }

  const width = Math.max(8, fallbackRect.width || 0);
  const left = fallbackRect.left - (width - fallbackRect.width) / 2;
  return [new DOMRect(left, fallbackRect.top, width, fallbackRect.height)];
}

function queueRefresh() {
  if (refreshQueued) {
    return;
  }

  refreshQueued = true;
  window.requestAnimationFrame(() => {
    refreshQueued = false;
    refreshHighlights();
  });
}

function attachOverlayListeners() {
  if (listenersAttached) {
    return;
  }

  listenersAttached = true;
  window.addEventListener("resize", queueRefresh);
  window.addEventListener("scroll", queueRefresh, true);
}

function renderGroup(group: HighlightRenderGroup, root: HTMLDivElement) {
  if (!document.body.contains(group.blockElement)) {
    debugLog(highlightDebugLoggingEnabled, "compose:render", "Skipping highlight render for detached block", {
      issueCount: group.issues.length,
      paragraphKey: group.blockElement.dataset.writingSuggestionsParagraphKey ?? null
    });
    return;
  }

  for (const issue of group.issues) {
    const range = createRangeForOffsets(group.blockElement, issue.start, issue.end);
    if (!range) {
      debugLog(highlightDebugLoggingEnabled, "compose:render", "Skipping highlight because offsets no longer map", {
        issueId: issue.id,
        start: issue.start,
        end: issue.end,
        blockTextLength: group.blockElement.innerText.length,
        reason: "range_mapping_failed"
      });
      continue;
    }

    const issueId = issue.id;
    const rects = getIssueRects(range);
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
        group.onActivate(issueId, button.getBoundingClientRect());
      });
      root.appendChild(button);
      buttons.push(button);
    }

    if (buttons.length > 0) {
      records.set(issueId, { issue, range: range.cloneRange(), buttons });
    }
  }
}

function refreshHighlights() {
  const root = ensureOverlay();
  debugLog(highlightDebugLoggingEnabled, "compose:render", "Refreshing highlight overlay", {
    groupCount: renderGroups.length,
    recordCount: records.size
  });
  root.replaceChildren();
  records.clear();

  for (const group of renderGroups) {
    renderGroup(group, root);
  }
}

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
    // Render extension-owned highlight affordances outside the editable body so suggestion UI never
    // becomes part of the outgoing message content.
    overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    document.documentElement.appendChild(overlay);
  }
  attachOverlayListeners();
  return overlay;
}

/** Removes all rendered suggestion highlights from the current compose window. */
export function clearHighlights() {
  ensureOverlay().replaceChildren();
  records.clear();
  renderGroups.length = 0;
}

/** Renders clickable highlight overlays for the active block's current suggestions. */
export function renderHighlights(
  blockElement: HTMLElement,
  issues: GrammarSuggestion[],
  onActivate: (issueId: string, anchorRect: DOMRect) => void
) {
  debugLog(highlightDebugLoggingEnabled, "compose:render", "Queueing paragraph highlights", {
    issueCount: issues.length,
    paragraphKey: blockElement.dataset.writingSuggestionsParagraphKey ?? null,
    blockTextLength: blockElement.innerText.length
  });
  renderGroups.push({ blockElement, issues, onActivate });
  refreshHighlights();
}

/** Returns the current overlay metadata for a suggestion, if it is still rendered. */
export function getHighlightRecord(issueId: string): HighlightRecord | null {
  return records.get(issueId) ?? null;
}
