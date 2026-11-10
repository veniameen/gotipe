/** Metrics belong to a block's editable text, never its controls or a nested block. */
function textHost(block: HTMLElement): HTMLElement {
  for (const selector of [
    "[data-gotipe-text-content]",
    "[data-gotipe-todo-content]",
    '[contenteditable="true"]',
  ]) {
    const host = Array.from(block.querySelectorAll<HTMLElement>(selector)).find(
      (candidate) => candidate.closest("[data-block-id]") === block,
    );
    if (host) return host;
  }
  return block;
}

function firstTextRect(block: HTMLElement, host: HTMLElement): DOMRect | null {
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      return parent?.closest("[data-block-id]") === block &&
        !parent.closest(
          'button, input, textarea, select, option, [contenteditable="false"], [data-gotipe-widget]',
        )
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? "";
    const start = text.search(/\S/);
    if (start < 0) continue;
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + 1);
    const rect = range.getBoundingClientRect();
    if (rect.height > 0 && rect.width > 0) return rect;
  }
  return null;
}

export function getBlockTextLeft(block: HTMLElement): number {
  const host = textHost(block);
  return firstTextRect(block, host)?.left ?? host.getBoundingClientRect().left;
}

export function getBlockFirstLineMetrics(block: HTMLElement): { top: number; height: number } {
  const host = textHost(block);
  const text = firstTextRect(block, host);
  if (text) return { top: text.top, height: text.height };
  const trailingBreak = Array.from(host.querySelectorAll("br[data-gotipe-trailing-break]")).find(
    (candidate) => candidate.closest("[data-block-id]") === block,
  );
  const trailingRect = trailingBreak?.getBoundingClientRect();
  if (trailingRect && trailingRect.height > 0)
    return { top: trailingRect.top, height: trailingRect.height };
  const rect = host.getBoundingClientRect();
  const lineHeight = Number.parseFloat(getComputedStyle(host).lineHeight);
  return {
    top: rect.top,
    height: Math.max(
      1,
      Math.min(rect.height, Number.isFinite(lineHeight) ? lineHeight : rect.height),
    ),
  };
}
