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
const MIN_CLICK_TARGET_WIDTH = 18;
const MIN_CLICK_TARGET_HEIGHT = 18;
const MIN_VISIBLE_UNDERLINE_WIDTH = 12;
const LIGHT_THEME_UNDERLINE = "#1769aa";
const DARK_THEME_UNDERLINE = "#8fd0ff";
const records = new Map<string, HighlightRecord>();
const renderGroups: HighlightRenderGroup[] = [];
let overlay: HTMLDivElement | null = null;
let refreshQueued = false;
let listenersAttached = false;
let highlightDebugLoggingEnabled = false;

export function setHighlightDebugLogging(enabled: boolean) {
  highlightDebugLoggingEnabled = enabled;
}

function parseRgbChannel(value: string): number | null {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseColorChannels(value: string): [number, number, number] | null {
  const match = value.match(/^rgba?\(([^)]+)\)$/i);
  if (!match) {
    return null;
  }

  const parts = match[1].split(",");
  if (parts.length < 3) {
    return null;
  }

  const red = parseRgbChannel(parts[0]);
  const green = parseRgbChannel(parts[1]);
  const blue = parseRgbChannel(parts[2]);
  if (red === null || green === null || blue === null) {
    return null;
  }

  return [red, green, blue];
}

function getRelativeLuminance([red, green, blue]: [number, number, number]): number {
  const normalize = (channel: number) => {
    const srgb = channel / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * normalize(red) + 0.7152 * normalize(green) + 0.0722 * normalize(blue);
}

function isDarkComposeSurface(): boolean {
  const backgroundCandidates = [document.body, document.documentElement]
    .map((element) => element ? window.getComputedStyle(element).backgroundColor : "")
    .filter(Boolean);

  for (const candidate of backgroundCandidates) {
    const channels = parseColorChannels(candidate);
    if (!channels) {
      continue;
    }

    if (getRelativeLuminance(channels) < 0.45) {
      return true;
    }

    return false;
  }

  const textColor = parseColorChannels(window.getComputedStyle(document.body).color);
  if (textColor) {
    return getRelativeLuminance(textColor) > 0.6;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function syncOverlayTheme() {
  const root = ensureOverlay();
  root.style.setProperty("--ws-grammar-underline", isDarkComposeSurface() ? DARK_THEME_UNDERLINE : LIGHT_THEME_UNDERLINE);
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

function expandClickTargetRect(rect: DOMRect): DOMRect {
  const width = Math.max(MIN_CLICK_TARGET_WIDTH, rect.width);
  const height = Math.max(MIN_CLICK_TARGET_HEIGHT, rect.height);
  const left = rect.left - (width - rect.width) / 2;
  const top = rect.top - (height - rect.height) / 2;
  return new DOMRect(left, top, width, height);
}

function getVisibleUnderlineMetrics(rect: DOMRect, clickRect: DOMRect) {
  const underlineWidth = Math.max(MIN_VISIBLE_UNDERLINE_WIDTH, rect.width);
  const underlineLeft = Math.max(0, rect.left - clickRect.left - (underlineWidth - rect.width) / 2);
  return {
    underlineLeft,
    underlineWidth
  };
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
      const clickRect = expandClickTargetRect(rect);
      const underlineMetrics = getVisibleUnderlineMetrics(rect, clickRect);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ws-highlight";
      button.dataset.issueType = issue.type;
      button.style.left = `${clickRect.left + window.scrollX}px`;
      button.style.top = `${clickRect.top + window.scrollY}px`;
      button.style.width = `${clickRect.width}px`;
      button.style.height = `${clickRect.height}px`;
      button.style.setProperty("--ws-underline-left", `${underlineMetrics.underlineLeft}px`);
      button.style.setProperty("--ws-underline-width", `${underlineMetrics.underlineWidth}px`);
      button.title = issue.message;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        group.onActivate(issueId, rect);
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
  syncOverlayTheme();
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
        left: var(--ws-underline-left, 0);
        width: var(--ws-underline-width, 100%);
        bottom: 0;
        border-bottom-width: 2px;
        border-bottom-style: solid;
      }

      .ws-highlight[data-issue-type="grammar"]::after {
        border-bottom-color: var(--ws-grammar-underline, #1769aa);
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
