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
import { isLatestRequest, matchesSnapshot } from "../shared/request-state";
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

function isCurrentSnapshot(activeBlockId: string, activeText: string): boolean {
  const blocks = collectBlocks();
  const currentActiveBlock = findActiveBlock(blocks);
  return matchesSnapshot(activeBlockId, activeText, currentActiveBlock?.id ?? null, currentActiveBlock?.text ?? null);
}

function isBlockSnapshotCurrent(block: BlockInfo): BlockInfo | null {
  const currentBlock = collectBlocks().find((entry) => entry.id === block.id) ?? null;
  if (!currentBlock) {
    return null;
  }

  return matchesSnapshot(block.id, block.text, currentBlock.id, currentBlock.text) ? currentBlock : null;
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
  return Array.from(highlightedBlocks.values()).reduce((count, entry) => count + entry.suggestions.length, 0);
}

function removeHighlightedSuggestion(issueId: string) {
  for (const [blockId, entry] of highlightedBlocks) {
    const nextSuggestions = entry.suggestions.filter((suggestion) => suggestion.id !== issueId);
    if (nextSuggestions.length === entry.suggestions.length) {
      continue;
    }

    if (nextSuggestions.length === 0) {
      highlightedBlocks.delete(blockId);
    } else {
      highlightedBlocks.set(blockId, {
        block: entry.block,
        suggestions: nextSuggestions
      });
    }
    return;
  }
}

function renderAllHighlights(tabId: number, scheduleFreshCheck: () => void) {
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
        hidePopup();
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
        removeHighlightedSuggestion(issueId);
        renderAllHighlights(tabId, scheduleFreshCheck);
        syncRenderedSuggestionStatus();
      },
      onAllow: async () => {
        await browser.runtime.sendMessage({
          type: "allowlist:add",
          phrase: record.issue.originalText
        } satisfies RuntimeMessage);
        hidePopup();
        scheduleFreshCheck();
      }
    });
  };

  for (const { block, suggestions } of highlightedBlocks.values()) {
    renderHighlights(block.element, suggestions, activate);
  }
}

function setHighlightedBlockSuggestions(
  block: BlockInfo,
  suggestions: GrammarSuggestion[],
  tabId: number,
  scheduleFreshCheck: () => void
) {
  if (suggestions.length === 0) {
    highlightedBlocks.delete(block.id);
  } else {
    highlightedBlocks.set(block.id, { block, suggestions });
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
  getLatestRequestId: () => number,
  scheduleFreshCheck: () => void
): Promise<CheckStatus> {
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
    clearRenderedSuggestions();
    hidePopup();
    return {
      state: "idle",
      message: exclusionReason ?? "BYO AI Grammar is on. Start typing to check this draft."
    };
  }

  const scopedBlocks = buildScope(blocks, activeBlock);
  composeDebugLog(settings.debugMode, "compose:editor", "Selected active and scoped blocks", {
    requestId,
    activeBlockId: activeBlock.id,
    blockCount: blocks.length,
    scopedBlockIds: scopedBlocks.map((block) => block.id),
    scopedLengths: scopedBlocks.map((block) => block.text.length)
  });
  const payload: CheckRequest = {
    requestId,
    tabId,
    activeBlockId: activeBlock.id,
    activeText: activeBlock.text,
    contextText: clampJoinedContext(scopedBlocks.map((block) => block.text)),
    blocks: scopedBlocks.map((block) => ({ blockId: block.id, text: block.text }))
  };

  composeDebugLog(settings.debugMode, "compose:editor", "Sending check request", {
    requestId,
    activeBlockId: activeBlock.id,
    activeTextLength: activeBlock.text.length,
    contextTextLength: payload.contextText.length
  });

  const response = await browser.runtime.sendMessage({ type: "check:request", payload } satisfies RuntimeMessage) as CheckResponse;
  if (!isLatestRequest(requestId, getLatestRequestId()) || response.requestId !== requestId || !isCurrentSnapshot(activeBlock.id, activeBlock.text)) {
    const snapshotMatches = isCurrentSnapshot(activeBlock.id, activeBlock.text);
    composeDebugLog(settings.debugMode, "compose:editor", "Dropping stale or mismatched response", {
      requestId,
      latestRequestId: getLatestRequestId(),
      responseRequestId: response.requestId,
      snapshotMatches
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
      composeDebugLog(settings.debugMode, "compose:editor", "Response was aborted", { requestId });
      return createStaleResult();
    }

    composeDebugLog(settings.debugMode, "compose:editor", "Received grammar error response", {
      requestId,
      code: response.code,
      message: response.message
    });
    return {
      state: response.code === "disabled" ? "idle" : "error",
      message: response.message
    };
  }

  const visibleSuggestions = (response.suggestionsByBlock[activeBlock.id] ?? []).filter(
    (suggestion) => !ignoredIssueIds.has(suggestion.id)
  );

  composeDebugLog(settings.debugMode, "compose:editor", "Received fresh grammar suggestions", {
    requestId,
    activeBlockId: activeBlock.id,
    suggestionCount: visibleSuggestions.length,
    suggestionIds: visibleSuggestions.map((suggestion) => suggestion.id)
  });

  clearRenderedSuggestions(false);
  setHighlightedBlockSuggestions(activeBlock, visibleSuggestions, tabId, scheduleFreshCheck);

  if (visibleSuggestions.length === 0) {
    return {
      state: "success",
      message: "No grammar suggestions in this paragraph."
    };
  }

  return {
    state: "success",
    message: `${visibleSuggestions.length} grammar suggestion${visibleSuggestions.length === 1 ? "" : "s"} ready.`
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
    const currentBlock = currentBlocks.find((block) => block.id === selectedBlock.id) ?? null;
    if (!currentBlock || currentBlock.text !== selectedBlock.text) {
      composeDebugLog(settings.debugMode, "compose:editor", "Stopping selected-paragraph batch because a block changed", {
        requestId,
        blockId: selectedBlock.id
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
    if (!isLatestRequest(requestId, getLatestRequestId()) || response.requestId !== requestId || !refreshedBlock) {
      composeDebugLog(settings.debugMode, "compose:editor", "Dropping stale selected-paragraph response", {
        requestId,
        latestRequestId: getLatestRequestId(),
        responseRequestId: response.requestId,
        blockId: currentBlock.id
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

    const visibleSuggestions = (response.suggestionsByBlock[refreshedBlock.id] ?? []).filter(
      (suggestion) => !ignoredIssueIds.has(suggestion.id)
    );
    composeDebugLog(settings.debugMode, "compose:editor", "Received selected-paragraph grammar suggestions", {
      requestId,
      activeBlockId: refreshedBlock.id,
      suggestionCount: visibleSuggestions.length,
      suggestionIds: visibleSuggestions.map((suggestion) => suggestion.id)
    });

    setHighlightedBlockSuggestions(refreshedBlock, visibleSuggestions, tabId, scheduleFreshCheck);

    const remainingBlocks = queuedBlocks
      .slice(index + 1)
      .map((block) => collectBlocks().find((entry) => entry.id === block.id) ?? null)
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
