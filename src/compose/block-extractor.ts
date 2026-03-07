export type BlockInfo = {
  id: string;
  element: HTMLElement;
  text: string;
};

const BLOCK_SELECTOR = "p, div, li, blockquote, pre";

function isMeaningfulBlock(element: HTMLElement): boolean {
  if (element.closest("blockquote[type='cite']")) {
    return false;
  }
  return Boolean(element.innerText.trim());
}

export function collectBlocks(): BlockInfo[] {
  const candidates = Array.from(document.body.querySelectorAll<HTMLElement>(BLOCK_SELECTOR));
  const seen = new Set<HTMLElement>();
  const blocks: BlockInfo[] = [];

  for (const element of candidates) {
    if (seen.has(element) || !isMeaningfulBlock(element)) {
      continue;
    }
    seen.add(element);
    const id = element.dataset.writingSuggestionsBlockId || crypto.randomUUID();
    element.dataset.writingSuggestionsBlockId = id;
    blocks.push({
      id,
      element,
      text: element.innerText.replace(/\s+/g, " ").trim()
    });
  }

  if (blocks.length === 0 && document.body.innerText.trim()) {
    const id = document.body.dataset.writingSuggestionsBlockId || crypto.randomUUID();
    document.body.dataset.writingSuggestionsBlockId = id;
    blocks.push({
      id,
      element: document.body,
      text: document.body.innerText.replace(/\s+/g, " ").trim()
    });
  }

  return blocks;
}

export function findActiveBlock(blocks: BlockInfo[]): BlockInfo | null {
  const selection = document.getSelection();
  const node = selection?.anchorNode;
  if (!node) {
    return blocks[0] ?? null;
  }

  const element = node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node.parentElement;
  if (!element) {
    return blocks[0] ?? null;
  }

  const activeElement = element.closest<HTMLElement>(BLOCK_SELECTOR) ?? document.body;
  return blocks.find((block) => block.element === activeElement) ?? blocks[0] ?? null;
}

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
