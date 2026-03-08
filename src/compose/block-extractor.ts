import { getTextForRangeMapping } from "./range-mapper";

/**
 * Compose-side block discovery helpers for Thunderbird's editable message body.
 *
 * Thunderbird compose markup varies across reply modes and signatures, so these
 * helpers work from visible-text offsets and leaf blocks instead of assuming stable wrapper nodes.
 */

/** Visible paragraph-like block that can be checked and reconciled locally. */
export type BlockInfo = {
  id: string;
  paragraphKey: string;
  element: HTMLElement;
  text: string;
  visibleIndex: number;
};

/** Snapshot of the current signature exclusion state for debug logging. */
export type SignatureDebugState = {
  signatureMarkerFound: boolean;
  signatureMarkerOffset: number | null;
  exclusionBoundaryOffset: number | null;
  selectionElementTag: string | null;
  selectionBlockTextLength: number | null;
  selectionOffset: number | null;
  selectionInsideSignature: boolean;
  bodyTextLength: number;
  bodyHtmlLength: number;
};

/** Snapshot of the selected compose blocks queued for a manual compose-action check. */
export type SelectedBlocksSnapshot = {
  blocks: BlockInfo[];
};

const BLOCK_SELECTOR = "p, div, li, blockquote, pre";
const SIGNATURE_SEPARATOR_PATTERN = /(^|\n)--\s*\n/m;
let blockIdCounter = 0;

function normalizeParagraphIdentityText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function hashParagraphText(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

/** Builds a stable paragraph key from normalized paragraph text and duplicate occurrence order. */
export function buildParagraphKey(text: string, occurrenceIndex: number): string {
  return `${hashParagraphText(normalizeParagraphIdentityText(text))}:${occurrenceIndex}`;
}

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

/** Returns the visible-text cutoff for signature content. */
export function getExclusionBoundaryOffset(text: string): number | null {
  return getSignatureSeparatorOffset(text);
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

  // Measure against the full compose body so later signature offsets line up with
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

function getSelectionRange(): Range | null {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  return selection.getRangeAt(0).cloneRange();
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

function getBlocksBeforeExclusionBoundary(): HTMLElement[] {
  const exclusionBoundaryOffset = getExclusionBoundaryOffset(getBodyVisibleText());
  const leafBlocks = getLeafBlocks();
  if (exclusionBoundaryOffset === null) {
    return leafBlocks;
  }

  return leafBlocks.filter((element) => {
    const offset = getElementVisibleStartOffset(element);
    return offset === null || offset < exclusionBoundaryOffset;
  });
}

function isMeaningfulBlock(element: HTMLElement): boolean {
  return Boolean(element.innerText.trim());
}

/** Explains why the current caret position should not receive grammar suggestions. */
export function getSelectionExclusionReason(): string | null {
  const element = findSelectionElement();
  if (!element) {
    return null;
  }

  if (isSelectionInsideSignature()) {
    return "Your email signature is ignored.";
  }

  return null;
}

/**
 * Returns the visible selected blocks for the compose action when a manual check is possible.
 *
 * The compose action treats the selection as a queue of intersecting paragraphs so manual checks can
 * reuse the normal per-paragraph suggestion flow without sending one large combined selection.
 */
export function getSelectedBlocksSnapshot(): SelectedBlocksSnapshot | null {
  const selectionRange = getSelectionRange();
  if (!selectionRange) {
    return null;
  }

  const blocks = collectBlocks().filter((block) => selectionRange.intersectsNode(block.element));
  if (blocks.length === 0) {
    return null;
  }

  return {
    blocks
  };
}

/**
 * Replaces the current DOM selection with the remaining selected blocks during a manual check batch.
 *
 * Shrinking the native selection gives the user progress feedback and returns the compose action to
 * its normal `On` state once every queued paragraph has been processed.
 */
export function setSelectedBlocksRange(blocks: BlockInfo[]) {
  const selection = document.getSelection();
  if (!selection) {
    return;
  }

  selection.removeAllRanges();
  if (blocks.length === 0) {
    return;
  }

  const firstBlock = blocks.find((block) => document.body.contains(block.element));
  const lastBlock = [...blocks].reverse().find((block) => document.body.contains(block.element));
  if (!firstBlock || !lastBlock) {
    return;
  }

  const range = document.createRange();
  range.setStartBefore(firstBlock.element);
  range.setEndAfter(lastBlock.element);
  selection.addRange(range);
}

/** Collects debug-friendly signature state for compose-side logging. */
export function getSignatureDebugState(): SignatureDebugState {
  const bodyText = getBodyVisibleText();
  const bodyHtml = document.body.innerHTML;
  const signatureOffset = getSignatureSeparatorOffset(bodyText);
  const selectionElement = findSelectionElement();
  const selectionBlock = findSelectionLeafBlock();
  const selectionOffset = getSelectionVisibleOffset();

  return {
    signatureMarkerFound: signatureOffset !== null,
    signatureMarkerOffset: signatureOffset,
    exclusionBoundaryOffset: getExclusionBoundaryOffset(bodyText),
    selectionElementTag: selectionElement?.tagName ?? null,
    selectionBlockTextLength: selectionBlock?.innerText.length ?? null,
    selectionOffset,
    selectionInsideSignature: isSelectionInsideSignature(),
    bodyTextLength: bodyText.length,
    bodyHtmlLength: bodyHtml.length
  };
}

/** Returns visible leaf blocks before any signature cutoff. */
export function collectBlocks(): BlockInfo[] {
  const blocks: BlockInfo[] = [];
  const paragraphOccurrences = new Map<string, number>();

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

    const normalizedIdentityText = normalizeParagraphIdentityText(rawText);
    const occurrenceIndex = paragraphOccurrences.get(normalizedIdentityText) ?? 0;
    paragraphOccurrences.set(normalizedIdentityText, occurrenceIndex + 1);
    const paragraphKey = buildParagraphKey(rawText, occurrenceIndex);
    element.dataset.writingSuggestionsParagraphKey = paragraphKey;

    blocks.push({
      id,
      paragraphKey,
      element,
      text: rawText,
      visibleIndex: blocks.length
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

  if (isSelectionInsideSignature()) {
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
 * Automatic compose checks are current-paragraph only, so this always returns the active block.
 */
export function buildScope(_blocks: BlockInfo[], activeBlock: BlockInfo) {
  return [activeBlock];
}
