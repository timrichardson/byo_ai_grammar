import {
  buildScope,
  collectBlocks,
  findActiveBlock,
  getSelectedTextSnapshot,
  getSelectionExclusionReason,
  getSignatureDebugState,
  type SelectedTextSnapshot
} from "./block-extractor";
import { composeDebugLog } from "./debug-log";
import { clearHighlights, getHighlightRecord, renderHighlights } from "./highlights";
import { hidePopup, showPopup } from "./popup";
import type { RuntimeMessage } from "../shared/messages";
import { MAX_SELECTED_TEXT_CHARS, clampJoinedContext } from "../shared/request-budget";
import { isLatestRequest, matchesSnapshot } from "../shared/request-state";
import type { CheckRequest, CheckResponse, Settings } from "../shared/types";

const SELECTED_TEXT_BLOCK_ID = "byo-ai-grammar-selected-text";
const ignoredIssueIds = new Set<string>();

function previewText(value: string): string {
  return value.replace(/\s+/g, " ").slice(0, 160);
}

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

function matchesSelectedTextSnapshot(snapshot: SelectedTextSnapshot): boolean {
  const currentSelection = getSelectedTextSnapshot();
  if (currentSelection) {
    return currentSelection.text === snapshot.text
      && currentSelection.startOffset === snapshot.startOffset
      && currentSelection.endOffset === snapshot.endOffset;
  }

  const selection = document.getSelection();
  return Boolean(selection && selection.toString() === snapshot.text);
}

function buildSelectionReplacementLabel(correctedText: string): string {
  const compact = correctedText.replace(/\s+/g, " ").trim();
  return compact.length > 80 ? "Replace selected text" : compact;
}

/**
 * Runs one grammar check for the current compose selection.
 *
 * This collects bounded nearby context, records debug state for signature and quote exclusions,
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
    clearHighlights();
    hidePopup();
    return {
      state: "idle",
      message: exclusionReason ?? "BYO AI Grammar is on. Start typing to check this draft."
    };
  }

  const scopedBlocks = buildScope(blocks, activeBlock, settings.checkCurrentParagraphOnly);
  composeDebugLog(settings.debugMode, "compose:editor", "Selected active and scoped blocks", {
    requestId,
    activeBlockId: activeBlock.id,
    blockCount: blocks.length,
    scopedBlockIds: scopedBlocks.map((block) => block.id),
    scopedLengths: scopedBlocks.map((block) => block.text.length),
    activeTextPreview: previewText(activeBlock.text),
    scopedTextPreviews: scopedBlocks.map((block) => ({
      blockId: block.id,
      preview: previewText(block.text)
    }))
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
    contextTextLength: payload.contextText.length,
    activeTextPreview: previewText(activeBlock.text),
    contextTextPreview: previewText(payload.contextText)
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
      clearHighlights();
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
        clearHighlights();
      },
      onIgnore: async () => {
        ignoredIssueIds.add(issueId);
        hidePopup();
        clearHighlights();
        renderHighlights(activeBlock.element, visibleSuggestions.filter((suggestion) => suggestion.id !== issueId), activate);
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

  renderHighlights(activeBlock.element, visibleSuggestions, activate);

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
 * Runs a one-off grammar check for the current text selection when the compose action is in `Check`
 * mode.
 *
 * Manual selection checks use the selected text as the active prompt input, keep nearby context short,
 * and show one replacement action for the full corrected selection instead of paragraph highlights.
 */
export async function runSelectedTextCheck(
  settings: Settings,
  tabId: number,
  requestId: number,
  getLatestRequestId: () => number,
  selectionSnapshot: SelectedTextSnapshot,
  scheduleFreshCheck: () => void
): Promise<CheckStatus> {
  if (selectionSnapshot.text.length > MAX_SELECTED_TEXT_CHARS) {
    clearHighlights();
    hidePopup();
    return {
      state: "error",
      message: `Selected text is too long for one manual check. Select ${MAX_SELECTED_TEXT_CHARS.toLocaleString()} characters or fewer.`
    };
  }

  clearHighlights();
  hidePopup();

  const payload: CheckRequest = {
    requestId,
    tabId,
    activeBlockId: SELECTED_TEXT_BLOCK_ID,
    activeText: selectionSnapshot.text,
    contextText: selectionSnapshot.contextText,
    blocks: [{ blockId: SELECTED_TEXT_BLOCK_ID, text: selectionSnapshot.text }]
  };

  composeDebugLog(settings.debugMode, "compose:editor", "Sending selected-text check request", {
    requestId,
    activeTextLength: selectionSnapshot.text.length,
    contextTextLength: selectionSnapshot.contextText.length,
    activeTextPreview: previewText(selectionSnapshot.text),
    contextTextPreview: previewText(selectionSnapshot.contextText)
  });

  const response = await browser.runtime.sendMessage({ type: "check:request", payload } satisfies RuntimeMessage) as CheckResponse;
  if (!isLatestRequest(requestId, getLatestRequestId()) || response.requestId !== requestId || !matchesSelectedTextSnapshot(selectionSnapshot)) {
    composeDebugLog(settings.debugMode, "compose:editor", "Dropping stale selected-text response", {
      requestId,
      latestRequestId: getLatestRequestId(),
      responseRequestId: response.requestId
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
      composeDebugLog(settings.debugMode, "compose:editor", "Selected-text response was aborted", { requestId });
      return createStaleResult();
    }

    composeDebugLog(settings.debugMode, "compose:editor", "Selected-text check failed", {
      requestId,
      code: response.code,
      message: response.message
    });
    return {
      state: response.code === "disabled" ? "idle" : "error",
      message: response.message
    };
  }

  const visibleSuggestions = (response.suggestionsByBlock[SELECTED_TEXT_BLOCK_ID] ?? []).filter(
    (suggestion) => !ignoredIssueIds.has(suggestion.id)
  );
  const correctedText = response.correctedTextByBlock[SELECTED_TEXT_BLOCK_ID] ?? selectionSnapshot.text;

  composeDebugLog(settings.debugMode, "compose:editor", "Received selected-text grammar suggestions", {
    requestId,
    suggestionCount: visibleSuggestions.length,
    correctedChanged: correctedText !== selectionSnapshot.text
  });

  if (visibleSuggestions.length === 0 || correctedText === selectionSnapshot.text) {
    return {
      state: "success",
      message: "No grammar suggestions in the selected text."
    };
  }

  const replacementRange = selectionSnapshot.range.cloneRange();
  showPopup({
    issue: {
      id: `${SELECTED_TEXT_BLOCK_ID}:${requestId}`,
      start: 0,
      end: selectionSnapshot.text.length,
      originalText: selectionSnapshot.text,
      replacementText: correctedText,
      type: "grammar",
      message: visibleSuggestions.length === 1
        ? "Apply the grammar fix to the selected text?"
        : `Apply ${visibleSuggestions.length} grammar fixes to the selected text?`,
      suggestions: []
    },
    anchorRect: selectionSnapshot.anchorRect,
    replacements: [{
      label: buildSelectionReplacementLabel(correctedText),
      value: correctedText
    }],
    showAllowButton: false,
    onReplace: async (replacement) => {
      replaceRange(replacementRange.cloneRange(), replacement);
      hidePopup();
      scheduleFreshCheck();
    },
    onPause: async () => {
      await browser.runtime.sendMessage({ type: "tab:pause", tabId, paused: true } satisfies RuntimeMessage);
      hidePopup();
    },
    onIgnore: async () => {
      hidePopup();
    },
    onAllow: async () => {
      hidePopup();
    }
  });

  return {
    state: "success",
    message: `${visibleSuggestions.length} grammar suggestion${visibleSuggestions.length === 1 ? "" : "s"} ready for the selected text.`
  };
}
