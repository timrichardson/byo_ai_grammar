import {
  type BlockInfo,
  buildScope,
  collectBlocks,
  findActiveBlock,
  getSelectionExclusionReason,
  getSignatureDebugState,
  setSelectedBlocksRange,
  type SelectedBlocksSnapshot
} from "./block-extractor";
import { composeDebugLog } from "./debug-log";
import { clearHighlights, getHighlightRecord, renderHighlights } from "./highlights";
import { hidePopup, showPopup } from "./popup";
import { setStatusIndicator } from "./status-indicator";
import type { RuntimeMessage } from "../shared/messages";
import { clampJoinedContext } from "../shared/request-budget";
import { isLatestParagraphRequest, matchesParagraphSnapshot } from "../shared/request-state";
import type { CheckRequest, CheckResponse, GrammarSuggestion, Settings } from "../shared/types";

type HighlightedBlockState = {
  block: BlockInfo;
  suggestions: GrammarSuggestion[];
};

type SuggestionSummaryContext =
  | { mode: "single" }
  | { mode: "selected"; blockCount: number };

const ignoredIssueIds = new Set<string>();
const highlightedBlocks = new Map<string, HighlightedBlockState>();
let suggestionSummaryContext: SuggestionSummaryContext | null = null;
let debugLoggingEnabled = false;

/** Compose-side status result used to update the floating indicator after each check. */
export type CheckStatus = {
  state: "idle" | "success" | "paused" | "error";
  message: string;
  stale?: boolean;
};

function replaceRangeDirectly(range: Range, text: string) {
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  const selection = document.getSelection();
  if (selection) {
    selection.removeAllRanges();
    const nextRange = document.createRange();
    nextRange.setStartAfter(node);
    nextRange.collapse(true);
    selection.addRange(nextRange);
  }
}

/**
 * Replaces the current suggestion range while preserving Thunderbird's native undo history when possible.
 *
 * `execCommand("insertText")` is deprecated on the web, but it still maps onto the editor transaction
 * machinery that Thunderbird uses for compose undo and redo. Fall back to direct DOM replacement if the
 * command is unavailable or rejected in the current editor state.
 */
function replaceRange(range: Range, text: string) {
  const selection = document.getSelection();
  if (selection) {
    selection.removeAllRanges();
    selection.addRange(range.cloneRange());

    try {
      if (document.execCommand("insertText", false, text)) {
        return;
      }
    } catch {
      // Fall back to direct DOM replacement below when Thunderbird refuses execCommand.
    }
  }

  replaceRangeDirectly(range, text);
}

function createStaleResult(): CheckStatus {
  return {
    state: "idle",
    message: "",
    stale: true
  };
}

function isBlockSnapshotCurrent(block: BlockInfo): BlockInfo | null {
  const currentBlock = collectBlocks().find((entry) => entry.paragraphKey === block.paragraphKey) ?? null;
  if (!currentBlock) {
    return null;
  }

  return matchesParagraphSnapshot(block.paragraphKey, block.text, currentBlock.paragraphKey, currentBlock.text) ? currentBlock : null;
}

function formatSuggestionSummary(count: number): CheckStatus | null {
  if (!suggestionSummaryContext) {
    return null;
  }

  if (suggestionSummaryContext.mode === "selected") {
    return {
      state: "success",
      message: count === 0
        ? "No grammar suggestions in the selected paragraphs."
        : `${count} grammar suggestion${count === 1 ? "" : "s"} ready across ${suggestionSummaryContext.blockCount} selected paragraph${suggestionSummaryContext.blockCount === 1 ? "" : "s"}.`
    };
  }

  return {
    state: "success",
    message: count === 0
      ? "No grammar suggestions in this paragraph."
      : `${count} grammar suggestion${count === 1 ? "" : "s"} ready.`
  };
}

function syncRenderedSuggestionStatus() {
  const summary = formatSuggestionSummary(totalHighlightedSuggestionCount());
  if (!summary) {
    return;
  }

  setStatusIndicator(summary.message, summary.state);
}

function clearRenderedSuggestions(resetSummaryContext = true) {
  clearHighlights();
  highlightedBlocks.clear();
  if (resetSummaryContext) {
    suggestionSummaryContext = null;
  }
}

function totalHighlightedSuggestionCount(): number {
  return Array.from(highlightedBlocks.values()).reduce(
    (count, entry) => count + entry.suggestions.filter((suggestion) => !ignoredIssueIds.has(suggestion.id)).length,
    0
  );
}

function pruneInvalidHighlightedBlocks() {
  const currentBlocks = collectBlocks();
  const currentBlocksByParagraphKey = new Map(currentBlocks.map((block) => [block.paragraphKey, block]));
  const claimedParagraphKeys = new Set<string>();
  const nextHighlightedBlocks = new Map<string, HighlightedBlockState>();

  for (const [paragraphKey, entry] of highlightedBlocks) {
    const currentBlockByParagraphKey = currentBlocksByParagraphKey.get(paragraphKey);
    if (currentBlockByParagraphKey && currentBlockByParagraphKey.text === entry.block.text && !claimedParagraphKeys.has(currentBlockByParagraphKey.paragraphKey)) {
      claimedParagraphKeys.add(currentBlockByParagraphKey.paragraphKey);
      nextHighlightedBlocks.set(currentBlockByParagraphKey.paragraphKey, {
        block: currentBlockByParagraphKey,
        suggestions: entry.suggestions
      });
      composeDebugLog(debugLoggingEnabled, "compose:paragraph-state", "Kept highlighted paragraph after remap", {
        paragraphKey,
        blockId: currentBlockByParagraphKey.id,
        reason: "paragraph_key_match",
        suggestionCount: entry.suggestions.length
      });
      continue;
    }

    const matchingTextBlocks = currentBlocks.filter((block) => block.text === entry.block.text && !claimedParagraphKeys.has(block.paragraphKey));
    const fallbackBlock = matchingTextBlocks.length === 1 ? matchingTextBlocks[0] : null;
    if (!fallbackBlock) {
      composeDebugLog(debugLoggingEnabled, "compose:paragraph-state", "Dropped highlighted paragraph during remap", {
        paragraphKey,
        previousBlockId: entry.block.id,
        reason: matchingTextBlocks.length > 1 ? "ambiguous_remap" : "paragraph_missing_or_changed",
        suggestionCount: entry.suggestions.length
      });
      continue;
    }

    claimedParagraphKeys.add(fallbackBlock.paragraphKey);
    nextHighlightedBlocks.set(fallbackBlock.paragraphKey, {
      block: fallbackBlock,
      suggestions: entry.suggestions
    });
    composeDebugLog(debugLoggingEnabled, "compose:paragraph-state", "Remapped highlighted paragraph by unique text match", {
      paragraphKey,
      previousBlockId: entry.block.id,
      nextParagraphKey: fallbackBlock.paragraphKey,
      nextBlockId: fallbackBlock.id,
      reason: "unique_text_match",
      suggestionCount: entry.suggestions.length
    });
  }

  highlightedBlocks.clear();
  for (const [blockId, entry] of nextHighlightedBlocks) {
    highlightedBlocks.set(blockId, entry);
  }
}

function getVisibleSuggestions(suggestions: GrammarSuggestion[]): GrammarSuggestion[] {
  return suggestions.filter((suggestion) => !ignoredIssueIds.has(suggestion.id));
}

function pruneIgnoredIssueIds() {
  const liveIssueIds = new Set<string>();
  for (const entry of highlightedBlocks.values()) {
    for (const suggestion of entry.suggestions) {
      liveIssueIds.add(suggestion.id);
    }
  }

  let changed = false;
  for (const issueId of Array.from(ignoredIssueIds)) {
    if (!liveIssueIds.has(issueId)) {
      ignoredIssueIds.delete(issueId);
      changed = true;
    }
  }

  return changed;
}

async function syncIgnoredSuggestionState(tabId: number) {
  await browser.runtime.sendMessage({
    type: "tab:ignored",
    tabId,
    hasIgnoredSuggestions: ignoredIssueIds.size > 0
  } satisfies RuntimeMessage);
}

function removeHighlightedParagraph(paragraphKey: string) {
  highlightedBlocks.delete(paragraphKey);
}

function getParagraphKeyForIssue(issueId: string): string | null {
  for (const [paragraphKey, entry] of highlightedBlocks) {
    if (entry.suggestions.some((suggestion) => suggestion.id === issueId)) {
      return paragraphKey;
    }
  }

  return null;
}

function removeSuggestionFromState(issueId: string) {
  for (const [paragraphKey, entry] of highlightedBlocks) {
    const nextSuggestions = entry.suggestions.filter((suggestion) => suggestion.id !== issueId);
    if (nextSuggestions.length === entry.suggestions.length) {
      continue;
    }

    if (nextSuggestions.length === 0) {
      highlightedBlocks.delete(paragraphKey);
    } else {
      highlightedBlocks.set(paragraphKey, {
        block: entry.block,
        suggestions: nextSuggestions
      });
    }

    return true;
  }

  return false;
}

function renderAllHighlights(tabId: number, scheduleFreshCheck: () => void) {
  pruneInvalidHighlightedBlocks();
  if (pruneIgnoredIssueIds()) {
    void syncIgnoredSuggestionState(tabId);
  }
  clearHighlights();

  const activate = (issueId: string, anchorRect: DOMRect) => {
    const record = getHighlightRecord(issueId);
    if (!record) {
      return;
    }

    showPopup({
      issue: record.issue,
      anchorRect,
      onReplace: async (replacement) => {
        replaceRange(record.range.cloneRange(), replacement);
        const paragraphKey = getParagraphKeyForIssue(record.issue.id);
        if (paragraphKey) {
          removeHighlightedParagraph(paragraphKey);
        }
        hidePopup();
        renderAllHighlights(tabId, scheduleFreshCheck);
        syncRenderedSuggestionStatus();
        scheduleFreshCheck();
      },
      onPause: async () => {
        await browser.runtime.sendMessage({ type: "tab:pause", tabId, paused: true } satisfies RuntimeMessage);
        hidePopup();
        clearRenderedSuggestions();
        setStatusIndicator("Grammar suggestions are paused for this draft.", "paused");
      },
      onIgnore: async () => {
        ignoredIssueIds.add(issueId);
        hidePopup();
        renderAllHighlights(tabId, scheduleFreshCheck);
        syncRenderedSuggestionStatus();
        await syncIgnoredSuggestionState(tabId);
      },
      onAllow: async () => {
        await browser.runtime.sendMessage({
          type: "allowlist:add",
          phrase: record.issue.originalText
        } satisfies RuntimeMessage);
        removeSuggestionFromState(record.issue.id);
        hidePopup();
        renderAllHighlights(tabId, scheduleFreshCheck);
        syncRenderedSuggestionStatus();
        scheduleFreshCheck();
      }
    });
  };

  for (const { block, suggestions } of highlightedBlocks.values()) {
    const visibleSuggestions = getVisibleSuggestions(suggestions);
    if (visibleSuggestions.length === 0) {
      continue;
    }

    renderHighlights(block.element, visibleSuggestions, activate);
  }
}

function setHighlightedBlockSuggestions(
  block: BlockInfo,
  suggestions: GrammarSuggestion[],
  tabId: number,
  scheduleFreshCheck: () => void
) {
  if (suggestions.length === 0) {
    highlightedBlocks.delete(block.paragraphKey);
    composeDebugLog(debugLoggingEnabled, "compose:paragraph-state", "Removed paragraph suggestions", {
      paragraphKey: block.paragraphKey,
      blockId: block.id,
      reason: "no_visible_suggestions",
      trackedParagraphKeys: Array.from(highlightedBlocks.keys())
    });
  } else {
    highlightedBlocks.set(block.paragraphKey, { block, suggestions });
    composeDebugLog(debugLoggingEnabled, "compose:paragraph-state", "Updated paragraph suggestions", {
      paragraphKey: block.paragraphKey,
      blockId: block.id,
      suggestionCount: suggestions.length,
      trackedParagraphKeys: Array.from(highlightedBlocks.keys())
    });
  }

  renderAllHighlights(tabId, scheduleFreshCheck);
}

/**
 * Runs one grammar check for the current compose selection.
 *
 * This checks the active paragraph, records signature exclusion state,
 * rejects stale responses when the caret moves, and wires accepted suggestions back into the editor
 * without breaking Thunderbird's native undo stack.
 */
export async function runCheck(
  settings: Settings,
  tabId: number,
  requestId: number,
  _getLatestRequestId: () => number,
  scheduleFreshCheck: () => void
): Promise<CheckStatus> {
  debugLoggingEnabled = settings.debugMode;
  suggestionSummaryContext = { mode: "single" };
  const blocks = collectBlocks();
  const exclusionReason = getSelectionExclusionReason();
  const signatureState = getSignatureDebugState();
  composeDebugLog(settings.debugMode, "compose:signature", "Evaluated signature exclusion state", {
    requestId,
    ...signatureState
  });
  const activeBlock = findActiveBlock(blocks);
  if (!activeBlock || !activeBlock.text) {
    composeDebugLog(settings.debugMode, "compose:editor", "No active block available for grammar check", {
      requestId,
      exclusionReason,
      signatureState
    });
    hidePopup();
    return {
      state: "idle",
      message: exclusionReason ?? "BYO AI Grammar is on. Start typing to check this draft."
    };
  }

  return runBlockCheck(
    settings,
    tabId,
    requestId,
    (paragraphKey: string) => paragraphKey === activeBlock.paragraphKey ? requestId : undefined,
    scheduleFreshCheck,
    activeBlock,
    "current-paragraph"
  );
}

/**
 * Runs one grammar check for a previously captured paragraph snapshot.
 *
 * This is used when the user presses Enter to start a new paragraph so the paragraph they just
 * finished can be checked immediately instead of waiting for the normal debounce window.
 */
export async function runBlockCheck(
  settings: Settings,
  tabId: number,
  requestId: number,
  getLatestParagraphRequestId: (paragraphKey: string) => number | undefined,
  scheduleFreshCheck: () => void,
  blockSnapshot: BlockInfo,
  requestSource: "current-paragraph" | "previous-paragraph"
): Promise<CheckStatus> {
  debugLoggingEnabled = settings.debugMode;
  suggestionSummaryContext = { mode: "single" };

  const scopedBlocks = buildScope([blockSnapshot], blockSnapshot);
  const payload: CheckRequest = {
    requestId,
    tabId,
    activeBlockId: blockSnapshot.id,
    activeText: blockSnapshot.text,
    contextText: clampJoinedContext(scopedBlocks.map((block) => block.text)),
    blocks: scopedBlocks.map((block) => ({ blockId: block.id, text: block.text }))
  };

  composeDebugLog(settings.debugMode, "compose:request-lane", "Sending paragraph check request", {
    requestId,
    source: requestSource,
    paragraphKey: blockSnapshot.paragraphKey,
    activeBlockId: blockSnapshot.id,
    activeTextLength: blockSnapshot.text.length,
    contextTextLength: payload.contextText.length,
    latestLaneRequestId: getLatestParagraphRequestId(blockSnapshot.paragraphKey) ?? null
  });

  const response = await browser.runtime.sendMessage({ type: "check:request", payload } satisfies RuntimeMessage) as CheckResponse;
  const refreshedBlock = isBlockSnapshotCurrent(blockSnapshot);
  const latestParagraphRequestId = getLatestParagraphRequestId(blockSnapshot.paragraphKey);
  if (!isLatestParagraphRequest(requestId, latestParagraphRequestId) || response.requestId !== requestId || !refreshedBlock) {
    composeDebugLog(settings.debugMode, "compose:stale", "Dropping stale paragraph response", {
      requestId,
      source: requestSource,
      paragraphKey: blockSnapshot.paragraphKey,
      latestLaneRequestId: latestParagraphRequestId ?? null,
      responseRequestId: response.requestId,
      blockId: blockSnapshot.id,
      reason: !isLatestParagraphRequest(requestId, latestParagraphRequestId)
        ? "latest_request_replaced"
        : refreshedBlock
          ? "response_request_mismatch"
          : "paragraph_missing_or_changed"
    });
    return createStaleResult();
  }

  hidePopup();
  if (!response.ok) {
    if (response.code === "paused") {
      clearRenderedSuggestions();
      return {
        state: "paused",
        message: "Grammar suggestions are paused for this draft."
      };
    }

    if (response.code === "aborted") {
      composeDebugLog(settings.debugMode, "compose:editor", "Paragraph response was aborted", {
        requestId,
        source: requestSource,
        paragraphKey: blockSnapshot.paragraphKey
      });
      return createStaleResult();
    }

    composeDebugLog(settings.debugMode, "compose:editor", "Received paragraph grammar error response", {
      requestId,
      source: requestSource,
      paragraphKey: blockSnapshot.paragraphKey,
      code: response.code,
      message: response.message
    });
    return {
      state: response.code === "disabled" ? "idle" : "error",
      message: response.message
    };
  }

  const allSuggestions = response.suggestionsByBlock[refreshedBlock.id] ?? [];
  const visibleSuggestions = getVisibleSuggestions(allSuggestions);

  composeDebugLog(settings.debugMode, "compose:editor", "Received paragraph grammar suggestions", {
    requestId,
    source: requestSource,
    paragraphKey: refreshedBlock.paragraphKey,
    activeBlockId: refreshedBlock.id,
    suggestionCount: visibleSuggestions.length,
    suggestionIds: visibleSuggestions.map((suggestion) => suggestion.id)
  });

  setHighlightedBlockSuggestions(refreshedBlock, allSuggestions, tabId, scheduleFreshCheck);

  if (visibleSuggestions.length === 0) {
    return {
      state: "success",
      message: requestSource === "previous-paragraph"
        ? "No grammar suggestions in the previous paragraph."
        : "No grammar suggestions in this paragraph."
    };
  }

  return {
    state: "success",
    message: requestSource === "previous-paragraph"
      ? `${visibleSuggestions.length} grammar suggestion${visibleSuggestions.length === 1 ? "" : "s"} ready in the previous paragraph.`
      : `${visibleSuggestions.length} grammar suggestion${visibleSuggestions.length === 1 ? "" : "s"} ready.`
  };
}

/**
 * Runs one manual grammar-check batch for the currently selected paragraphs.
 *
 * Each selected paragraph is submitted as its own normal grammar request so the compose UI can show
 * standard per-paragraph highlights without one large all-or-nothing replacement popup.
 */
export async function runSelectedBlocksCheck(
  settings: Settings,
  tabId: number,
  selectionSnapshot: SelectedBlocksSnapshot,
  nextRequestId: () => number,
  getLatestRequestId: () => number,
  scheduleFreshCheck: () => void,
  onProgress: (message: string) => void
): Promise<CheckStatus> {
  debugLoggingEnabled = settings.debugMode;
  clearRenderedSuggestions();
  hidePopup();

  const queuedBlocks = [...selectionSnapshot.blocks];
  const totalBlockCount = queuedBlocks.length;
  if (totalBlockCount === 0) {
    return {
      state: "idle",
      message: "Select one or more paragraphs to run a manual grammar check."
    };
  }

  suggestionSummaryContext = { mode: "selected", blockCount: totalBlockCount };

  for (let index = 0; index < queuedBlocks.length; index += 1) {
    const requestId = nextRequestId();
    const selectedBlock = queuedBlocks[index];
    const currentBlocks = collectBlocks();
    const currentBlock = currentBlocks.find((block) => block.paragraphKey === selectedBlock.paragraphKey) ?? null;
    if (!currentBlock || currentBlock.text !== selectedBlock.text) {
      composeDebugLog(settings.debugMode, "compose:editor", "Stopping selected-paragraph batch because a block changed", {
        requestId,
        blockId: selectedBlock.id,
        paragraphKey: selectedBlock.paragraphKey
      });
      return createStaleResult();
    }

    const scopedBlocks = buildScope(currentBlocks, currentBlock);
    const payload: CheckRequest = {
      requestId,
      tabId,
      activeBlockId: currentBlock.id,
      activeText: currentBlock.text,
      contextText: clampJoinedContext(scopedBlocks.map((block) => block.text)),
      blocks: scopedBlocks.map((block) => ({ blockId: block.id, text: block.text }))
    };

    onProgress(`Checking selected paragraphs (${index + 1}/${totalBlockCount})...`);
    composeDebugLog(settings.debugMode, "compose:editor", "Sending selected-paragraph check request", {
      requestId,
      activeBlockId: currentBlock.id,
      activeTextLength: currentBlock.text.length,
      contextTextLength: payload.contextText.length
    });

    const response = await browser.runtime.sendMessage({ type: "check:request", payload } satisfies RuntimeMessage) as CheckResponse;
    const refreshedBlock = isBlockSnapshotCurrent(currentBlock);
    if (requestId !== getLatestRequestId() || response.requestId !== requestId || !refreshedBlock) {
      composeDebugLog(settings.debugMode, "compose:stale", "Dropping stale selected-paragraph response", {
        requestId,
        latestRequestId: getLatestRequestId(),
        responseRequestId: response.requestId,
        blockId: currentBlock.id,
        paragraphKey: currentBlock.paragraphKey,
        reason: requestId !== getLatestRequestId()
          ? "latest_request_replaced"
          : refreshedBlock
            ? "response_request_mismatch"
            : "paragraph_missing_or_changed"
      });
      return createStaleResult();
    }

    if (!response.ok) {
      if (response.code === "paused") {
        return {
          state: "paused",
          message: "Grammar suggestions are paused for this draft."
        };
      }

      if (response.code === "aborted") {
        composeDebugLog(settings.debugMode, "compose:editor", "Selected-paragraph response was aborted", { requestId });
        return createStaleResult();
      }

      composeDebugLog(settings.debugMode, "compose:editor", "Selected-paragraph check failed", {
        requestId,
        code: response.code,
        message: response.message
      });
      return {
        state: response.code === "disabled" ? "idle" : "error",
        message: response.message
      };
    }

    const allSuggestions = response.suggestionsByBlock[refreshedBlock.id] ?? [];
    const visibleSuggestions = getVisibleSuggestions(allSuggestions);
    composeDebugLog(settings.debugMode, "compose:editor", "Received selected-paragraph grammar suggestions", {
      requestId,
      activeBlockId: refreshedBlock.id,
      suggestionCount: visibleSuggestions.length,
      suggestionIds: visibleSuggestions.map((suggestion) => suggestion.id)
    });

    setHighlightedBlockSuggestions(refreshedBlock, allSuggestions, tabId, scheduleFreshCheck);

    const remainingBlocks = queuedBlocks
      .slice(index + 1)
      .map((block) => collectBlocks().find((entry) => entry.paragraphKey === block.paragraphKey) ?? null)
      .filter((block): block is BlockInfo => block !== null);
    setSelectedBlocksRange(remainingBlocks);
  }

  const totalSuggestionCount = totalHighlightedSuggestionCount();

  return {
    state: "success",
    message: totalSuggestionCount === 0
      ? "No grammar suggestions in the selected paragraphs."
      : `${totalSuggestionCount} grammar suggestion${totalSuggestionCount === 1 ? "" : "s"} ready across ${totalBlockCount} selected paragraph${totalBlockCount === 1 ? "" : "s"}.`
  };
}

/** Clears all message-level ignore-once decisions and rerenders any still-valid suggestions. */
export async function resetIgnoredSuggestions(tabId: number, scheduleFreshCheck: () => void) {
  ignoredIssueIds.clear();
  hidePopup();
  renderAllHighlights(tabId, scheduleFreshCheck);
  syncRenderedSuggestionStatus();
  await syncIgnoredSuggestionState(tabId);
}
