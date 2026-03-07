import { buildScope, collectBlocks, findActiveBlock } from "./block-extractor";
import { clearHighlights, getHighlightRecord, renderHighlights } from "./highlights";
import { hidePopup, showPopup } from "./popup";
import type { RuntimeMessage } from "../shared/messages";
import type { CheckRequest, CheckResponse, Settings } from "../shared/types";

const MAX_CONTEXT_CHARS = 1800;
const ignoredIssueIds = new Set<string>();

function clampContext(blockTexts: string[]) {
  const joined = blockTexts.join("\n\n");
  return joined.length <= MAX_CONTEXT_CHARS ? joined : joined.slice(0, MAX_CONTEXT_CHARS);
}

function replaceRange(range: Range, text: string) {
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

export async function runCheck(settings: Settings, tabId: number) {
  const blocks = collectBlocks();
  const activeBlock = findActiveBlock(blocks);
  if (!activeBlock || !activeBlock.text) {
    clearHighlights();
    hidePopup();
    return;
  }

  const scopedBlocks = buildScope(blocks, activeBlock, settings.checkCurrentParagraphOnly);
  const payload: CheckRequest = {
    tabId,
    activeBlockId: activeBlock.id,
    activeText: activeBlock.text,
    contextText: clampContext(scopedBlocks.map((block) => block.text)),
    blocks: scopedBlocks.map((block) => ({ blockId: block.id, text: block.text }))
  };

  const response = await browser.runtime.sendMessage({ type: "check:request", payload } satisfies RuntimeMessage) as CheckResponse;
  clearHighlights();
  hidePopup();
  if (!response.ok) {
    return;
  }

  const visibleIssues = (response.issuesByBlock[activeBlock.id] ?? []).filter(
    (issue) => !ignoredIssueIds.has(`${activeBlock.id}:${issue.offset}:${issue.length}`)
  );

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
        await runCheck(settings, tabId);
      },
      onPause: async () => {
        await browser.runtime.sendMessage({ type: "tab:pause", tabId, paused: true } satisfies RuntimeMessage);
        hidePopup();
        clearHighlights();
      },
      onIgnore: async () => {
        ignoredIssueIds.add(issueId);
        hidePopup();
        await runCheck(settings, tabId);
      },
      onAllow: async () => {
        await browser.runtime.sendMessage({
          type: "allowlist:add",
          phrase: record.issue.text
        } satisfies RuntimeMessage);
        hidePopup();
        await runCheck(settings, tabId);
      }
    });
  };

  renderHighlights(activeBlock.element, activeBlock.id, visibleIssues, activate);
}
