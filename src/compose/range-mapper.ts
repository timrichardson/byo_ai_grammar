/**
 * Helpers for mapping local diff offsets back into Thunderbird compose DOM ranges.
 *
 * Suggestion offsets are computed from concatenated text nodes inside a leaf block, so these helpers
 * must walk text nodes in document order and gracefully fail when the DOM no longer matches.
 */

type TextSegment = {
  node: Text;
  start: number;
  end: number;
};

function collectTextSegments(root: HTMLElement): TextSegment[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const segments: TextSegment[] = [];
  let currentOffset = 0;

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const value = node.nodeValue ?? "";
    if (!value) {
      continue;
    }
    segments.push({
      node,
      start: currentOffset,
      end: currentOffset + value.length
    });
    currentOffset += value.length;
  }

  return segments;
}

/** Returns the plain text used as the source of truth for local range mapping inside a block. */
export function getTextForRangeMapping(root: HTMLElement): string {
  return collectTextSegments(root).map((segment) => segment.node.nodeValue ?? "").join("");
}

/**
 * Creates a DOM range for diff offsets within a block.
 *
 * Returns `null` when Thunderbird has reflowed or rewritten the block so the requested offsets no
 * longer land on current text nodes.
 */
export function createRangeForOffsets(root: HTMLElement, start: number, end: number): Range | null {
  const segments = collectTextSegments(root);
  const startSegment = segments.find((segment) => start >= segment.start && start <= segment.end);
  const endSegment = segments.find((segment) => end >= segment.start && end <= segment.end);

  if (!startSegment || !endSegment) {
    return null;
  }

  const range = document.createRange();
  range.setStart(startSegment.node, Math.max(0, start - startSegment.start));
  range.setEnd(endSegment.node, Math.max(0, end - endSegment.start));
  return range;
}
