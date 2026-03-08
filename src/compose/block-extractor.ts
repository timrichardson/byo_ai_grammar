import { getTextForRangeMapping } from "./range-mapper";
import { buildSelectedTextContext } from "../shared/request-budget";

/**
 * Compose-side block discovery helpers for Thunderbird's editable message body.
 *
 * Thunderbird compose markup varies across reply modes, signatures, and quoted content, so these
 * helpers work from visible-text offsets and leaf blocks instead of assuming stable wrapper nodes.
 */

/** Visible paragraph-like block that can be checked and reconciled locally. */
export type BlockInfo = {
  id: string;
  element: HTMLElement;
  text: string;
};

/** Snapshot of the current signature and quoted-reply exclusion state for debug logging. */
export type SignatureDebugState = {
  signatureMarkerFound: boolean;
  signatureMarkerOffset: number | null;
  quotedReplyMarkerFound: boolean;
  quotedReplyMarkerOffset: number | null;
  exclusionBoundaryOffset: number | null;
  selectionElementTag: string | null;
  selectionBlockText: string | null;
  selectionOffset: number | null;
  selectionInsideSignature: boolean;
  selectionInsideQuotedReply: boolean;
  bodyText: string;
  bodyHtml: string;
};

/** Snapshot of the current manual selection used for compose-action checks. */
export type SelectedTextSnapshot = {
  text: string;
  range: Range;
  anchorRect: DOMRect;
  startOffset: number;
  endOffset: number;
  contextText: string;
};

const BLOCK_SELECTOR = "p, div, li, blockquote, pre";
const QUOTED_SELECTOR = "blockquote[type='cite'], .moz-cite-prefix, .moz-forward-container, .moz-email-headers-table";
const SIGNATURE_SEPARATOR_PATTERN = /(^|\n)--\s*\n/m;
const QUOTED_REPLY_HEADER_PATTERN = /(^|\n)On [^\n]+ wrote:\n/m;
let blockIdCounter = 0;

function createBlockId(): string {
  blockIdCounter += 1;
  return `byo-ai-grammar-block-${Date.now()}-${blockIdCounter}`;
}

function normalizeVisibleText(text: string): string {
  return text.replace(/\r/g, "");
}

function getBodyVisibleText(): string {
  return normalizeVisibleText(document.body.innerText ?? "");
}

function getSignatureSeparatorOffset(text: string): number | null {
  const match = SIGNATURE_SEPARATOR_PATTERN.exec(text);
  if (!match || typeof match.index !== "number") {
    return null;
  }

  return match.index + match[1].length;
}

/** Returns the visible-text offset where a reply header starts, if Thunderbird rendered one. */
export function getQuotedReplyOffset(text: string): number | null {
  const match = QUOTED_REPLY_HEADER_PATTERN.exec(text);
  if (!match || typeof match.index !== "number") {
    return null;
  }

  return match.index + match[1].length;
}

/** Returns the earliest visible-text cutoff for signature or quoted reply content. */
export function getExclusionBoundaryOffset(text: string): number | null {
  const offsets = [getSignatureSeparatorOffset(text), getQuotedReplyOffset(text)].filter(
    (offset): offset is number => offset !== null
  );

  return offsets.length > 0 ? Math.min(...offsets) : null;
}

function isQuotedElement(element: HTMLElement): boolean {
  return Boolean(element.closest(QUOTED_SELECTOR));
}

function getCandidateBlocks(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll<HTMLElement>(BLOCK_SELECTOR));
}

function isLeafBlock(element: HTMLElement): boolean {
  return !Array.from(element.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)).some((child) => child !== element && child.innerText.trim());
}

function getLeafBlocks(): HTMLElement[] {
  return getCandidateBlocks().filter((element) => isLeafBlock(element) && element.innerText.trim());
}

function getElementVisibleStartOffset(element: HTMLElement): number | null {
  if (!document.body.contains(element)) {
    return null;
  }

  // Measure against the full compose body so later signature and quoted-reply offsets line up with
  // the same visible-text coordinate system used for selection snapshots.
  const range = document.createRange();
  range.selectNodeContents(document.body);
  range.setEndBefore(element);
  return normalizeVisibleText(range.toString()).length;
}

function findSelectionElement(): HTMLElement | null {
  const selection = document.getSelection();
  const node = selection?.anchorNode;
  if (!node) {
    return null;
  }

  return node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
}

function getRangeVisibleOffset(container: Node, offset: number): number | null {
  if (!document.body?.contains(container)) {
    return null;
  }

  const prefix = document.createRange();
  prefix.selectNodeContents(document.body);
  prefix.setEnd(container, offset);
  return normalizeVisibleText(prefix.toString()).length;
}

function getSelectionVisibleOffset(): number | null {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  // Thunderbird may place the caret inside helper wrappers that do not correspond to outgoing HTML,
  // so compute a visible-text prefix instead of trusting DOM ancestry or child indexes.
  const range = selection.getRangeAt(0).cloneRange();
  const prefix = document.createRange();
  prefix.selectNodeContents(document.body);
  prefix.setEnd(range.startContainer, range.startOffset);
  return normalizeVisibleText(prefix.toString()).length;
}

function getSelectionVisibleRange(): { range: Range; startOffset: number; endOffset: number } | null {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0).cloneRange();
  const startOffset = getRangeVisibleOffset(range.startContainer, range.startOffset);
  const endOffset = getRangeVisibleOffset(range.endContainer, range.endOffset);
  if (startOffset === null || endOffset === null || endOffset <= startOffset) {
    return null;
  }

  return { range, startOffset, endOffset };
}

function getSelectionAnchorRect(range: Range): DOMRect {
  const firstRect = range.getClientRects().item(0);
  return firstRect ?? range.getBoundingClientRect();
}

function findSelectionLeafBlock(): HTMLElement | null {
  const selectionElement = findSelectionElement();
  if (!selectionElement) {
    return null;
  }

  // Prefer the deepest visible block so nested reply wrappers still resolve to the user-facing
  // paragraph that local diffing and highlight rendering expect.
  const containingBlocks = getLeafBlocks().filter((block) => block === selectionElement || block.contains(selectionElement));
  return containingBlocks.at(-1) ?? null;
}

function isSelectionInsideSignature(): boolean {
  const signatureOffset = getSignatureSeparatorOffset(getBodyVisibleText());
  const selectionOffset = getSelectionVisibleOffset();
  if (signatureOffset === null || selectionOffset === null) {
    return false;
  }

  return selectionOffset >= signatureOffset;
}

function isSelectionInsideQuotedReply(): boolean {
  const selectionElement = findSelectionElement();
  if (selectionElement && isQuotedElement(selectionElement)) {
    return true;
  }

  const quotedReplyOffset = getQuotedReplyOffset(getBodyVisibleText());
  const selectionOffset = getSelectionVisibleOffset();
  if (quotedReplyOffset === null || selectionOffset === null) {
    return false;
  }

  return selectionOffset >= quotedReplyOffset;
}

function getBlocksBeforeExclusionBoundary(): HTMLElement[] {
  const exclusionBoundaryOffset = getExclusionBoundaryOffset(getBodyVisibleText());
  const leafBlocks = getLeafBlocks().filter((element) => !isQuotedElement(element));
  if (exclusionBoundaryOffset === null) {
    return leafBlocks;
  }

  return leafBlocks.filter((element) => {
    const offset = getElementVisibleStartOffset(element);
    return offset === null || offset < exclusionBoundaryOffset;
  });
}

function isMeaningfulBlock(element: HTMLElement): boolean {
  if (isQuotedElement(element)) {
    return false;
  }

  return Boolean(element.innerText.trim());
}

/** Explains why the current caret position should not receive grammar suggestions. */
export function getSelectionExclusionReason(): string | null {
  const element = findSelectionElement();
  if (!element) {
    return null;
  }

  if (isQuotedElement(element)) {
    return "Quoted reply text is ignored.";
  }

  if (isSelectionInsideQuotedReply()) {
    return "Quoted reply text is ignored.";
  }

  if (isSelectionInsideSignature()) {
    return "Your email signature is ignored.";
  }

  return null;
}

/**
 * Returns a bounded selected-text snapshot for the compose action when a manual check is possible.
 *
 * Manual selection checks stay out of signatures and quoted replies, and only send short nearby
 * before-and-after context so user-selected passages remain compatible with smaller model windows.
 */
export function getSelectedTextSnapshot(): SelectedTextSnapshot | null {
  const visibleRange = getSelectionVisibleRange();
  if (!visibleRange) {
    return null;
  }

  const selectionElement = findSelectionElement();
  if (!selectionElement || isQuotedElement(selectionElement) || isSelectionInsideQuotedReply() || isSelectionInsideSignature()) {
    return null;
  }

  const text = normalizeVisibleText(visibleRange.range.toString());
  if (!text.trim()) {
    return null;
  }

  const bodyText = getBodyVisibleText();
  const exclusionBoundaryOffset = getExclusionBoundaryOffset(bodyText);
  if (exclusionBoundaryOffset !== null && visibleRange.endOffset > exclusionBoundaryOffset) {
    return null;
  }

  return {
    text,
    range: visibleRange.range,
    anchorRect: getSelectionAnchorRect(visibleRange.range),
    startOffset: visibleRange.startOffset,
    endOffset: visibleRange.endOffset,
    contextText: buildSelectedTextContext(bodyText, visibleRange.startOffset, visibleRange.endOffset)
  };
}

/** Collects debug-friendly signature and quoted-reply state for compose-side logging. */
export function getSignatureDebugState(): SignatureDebugState {
  const bodyText = getBodyVisibleText();
  const bodyHtml = document.body.innerHTML;
  const signatureOffset = getSignatureSeparatorOffset(bodyText);
  const quotedReplyOffset = getQuotedReplyOffset(bodyText);
  const selectionElement = findSelectionElement();
  const selectionBlock = findSelectionLeafBlock();
  const selectionOffset = getSelectionVisibleOffset();

  return {
    signatureMarkerFound: signatureOffset !== null,
    signatureMarkerOffset: signatureOffset,
    quotedReplyMarkerFound: quotedReplyOffset !== null,
    quotedReplyMarkerOffset: quotedReplyOffset,
    exclusionBoundaryOffset: getExclusionBoundaryOffset(bodyText),
    selectionElementTag: selectionElement?.tagName ?? null,
    selectionBlockText: selectionBlock?.innerText ?? null,
    selectionOffset,
    selectionInsideSignature: isSelectionInsideSignature(),
    selectionInsideQuotedReply: isSelectionInsideQuotedReply(),
    bodyText,
    bodyHtml
  };
}

/** Returns visible leaf blocks before any signature or quoted-reply cutoff. */
export function collectBlocks(): BlockInfo[] {
  const blocks: BlockInfo[] = [];

  for (const element of getBlocksBeforeExclusionBoundary()) {
    if (!isMeaningfulBlock(element)) {
      continue;
    }

    const id = element.dataset.writingSuggestionsBlockId || createBlockId();
    element.dataset.writingSuggestionsBlockId = id;
    const rawText = getTextForRangeMapping(element);
    if (!rawText.trim()) {
      continue;
    }

    blocks.push({
      id,
      element,
      text: rawText
    });
  }

  return blocks;
}

/** Returns the current leaf block under the caret when it is eligible for grammar checks. */
export function findActiveBlock(blocks: BlockInfo[]): BlockInfo | null {
  const selectionElement = findSelectionElement();
  if (!selectionElement) {
    return null;
  }

  if (isQuotedElement(selectionElement) || isSelectionInsideQuotedReply() || isSelectionInsideSignature()) {
    return null;
  }

  const selectionBlock = findSelectionLeafBlock();
  if (!selectionBlock) {
    return null;
  }

  return blocks.find((block) => block.element === selectionBlock) ?? null;
}

/**
 * Builds the bounded checking scope around the active block.
 *
 * Paragraph-only mode keeps requests limited to the current block. Otherwise the immediately
 * adjacent visible blocks are included as nearby context for the prompt.
 */
export function buildScope(blocks: BlockInfo[], activeBlock: BlockInfo, paragraphOnly: boolean) {
  const activeIndex = blocks.findIndex((block) => block.id === activeBlock.id);
  if (activeIndex === -1) {
    return [activeBlock];
  }

  if (paragraphOnly) {
    return [activeBlock];
  }

  const scoped = [blocks[activeIndex]];
  if (blocks[activeIndex - 1]) {
    scoped.unshift(blocks[activeIndex - 1]);
  }
  if (blocks[activeIndex + 1]) {
    scoped.push(blocks[activeIndex + 1]);
  }
  return scoped.filter((block, index, array) => array.findIndex((entry) => entry.id === block.id) === index);
}
