import { createTextWalker } from "@gotipe/core";

/** Client rect of a document position (blockId, offset). */
export function rectAt(root: HTMLElement, blockId: string, offset: number): DOMRect | null {
  const blockEl = root.querySelector(`[data-block-id="${CSS.escape(blockId)}"]`);
  if (!blockEl) return null;
  const host =
    blockEl.querySelector("[data-gotipe-todo-content]") ??
    blockEl.querySelector(".gotipe-callout-content") ??
    blockEl;
  const walker = createTextWalker(host);
  let acc = 0;
  let node: Node | null;
  let last: Text | null = null;
  for (node = walker.nextNode(); node; node = walker.nextNode()) {
    const owner = node.parentElement?.closest("[data-block-id]");
    if (owner && owner !== blockEl) continue;
    const text = node as Text;
    last = text;
    const len = text.length;
    if (acc + len >= offset) {
      const range = document.createRange();
      const at = Math.max(0, offset - acc);
      range.setStart(text, at);
      range.setEnd(text, at);
      const rects = range.getClientRects();
      if (rects.length > 0) return rects[rects.length - 1]!;
      if (at > 0) {
        range.setStart(text, at - 1);
        const r = range.getBoundingClientRect();
        return new DOMRect(r.right, r.top, 0, r.height);
      }
      return range.getBoundingClientRect();
    }
    acc += len;
  }
  if (last) {
    const range = document.createRange();
    range.selectNodeContents(last);
    const r = range.getBoundingClientRect();
    return new DOMRect(r.right, r.top, 0, r.height);
  }
  const r = (host as Element).getBoundingClientRect();
  return new DOMRect(r.left, r.top, 0, Math.min(r.height, 22));
}

/** End of the last piece of a proposal's new text in the DOM. */
export function proposalEndRect(root: HTMLElement, proposalId: string): DOMRect | null {
  const nodes = root.querySelectorAll(
    `[data-gotipe-proposal="${CSS.escape(proposalId)}"].gotipe-sug-ins, [data-gotipe-proposal="${CSS.escape(proposalId)}"].gotipe-sug-block-ins`,
  );
  const el = nodes[nodes.length - 1];
  if (!el) return null;
  const range = document.createRange();
  range.selectNodeContents(el);
  const rects = range.getClientRects();
  const r = rects.length > 0 ? rects[rects.length - 1]! : el.getBoundingClientRect();
  return new DOMRect(r.right, r.top, 0, r.height || 20);
}

/**
 * Where a suggestion or a comment stands. A whole block (a suggested list item, task, paragraph)
 * stands where its text starts, past its marker or checkbox, so its card lines up with the text;
 * an inline mark is its own box.
 */
export function decorationRect(root: HTMLElement, attr: string, id: string): DOMRect | null {
  const el = root.querySelector(`[${attr}="${CSS.escape(id)}"]`);
  if (!el) return null;
  const box = el.getBoundingClientRect();
  if (!el.matches("[data-block-id], [data-gotipe-phantom-id]")) return box;
  const left = blockTextLeft(el);
  return left === null || left <= box.left
    ? box
    : new DOMRect(left, box.top, box.right - left, box.height);
}

/** The left edge of a block's own first text, or null when it shows none. */
function blockTextLeft(block: Element): number | null {
  // right to left, the text starts at the right: the box's own edge stands
  if (getComputedStyle(block).direction === "rtl") return null;
  const own = (selector: string) =>
    [...block.querySelectorAll(selector)].find(
      (element) => element.closest("[data-block-id], [data-gotipe-phantom-id]") === block,
    );
  const host = own("[data-gotipe-todo-content]") ?? own(".gotipe-callout-content") ?? block;
  const walker = createTextWalker(host);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const owner = node.parentElement?.closest("[data-block-id], [data-gotipe-phantom-id]");
    if (owner && owner !== block) continue;
    if (!(node as Text).length) continue;
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, 1);
    const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
    return rect.width || rect.height ? rect.left : null;
  }
  return null;
}
