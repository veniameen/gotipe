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
 * The end of the text of every growing proposal on the page, by proposal id: where its last
 * inserted piece ends (the piece marked `gotipe-sug-live`). One pass over the page for all of
 * them, however many there are.
 */
export function liveEndRects(root: HTMLElement): Map<string, DOMRect> {
  const ends = new Map<string, DOMRect>();
  for (const mark of root.getElementsByClassName("gotipe-sug-live")) {
    const id = mark.closest("[data-gotipe-proposal]")?.getAttribute("data-gotipe-proposal");
    if (!id) continue;
    // a block marked itself has no text of its own: a code block ends where its code does
    const text = mark.querySelector("pre > code") ?? mark;
    const range = document.createRange();
    range.selectNodeContents(text);
    const rects = range.getClientRects();
    const r = rects.length > 0 ? rects[rects.length - 1]! : text.getBoundingClientRect();
    ends.set(id, new DOMRect(rects.length > 0 ? r.right : r.left, r.top, 0, r.height || 20));
  }
  return ends;
}

const BLOCK = "[data-block-id], [data-gotipe-phantom-id]";

/**
 * Where a suggestion or a comment stands. A whole block (a suggested list item, task, paragraph)
 * stands where its text starts, past its marker or checkbox, so its card lines up with the text;
 * an inline mark is its own box.
 */
export function decorationRect(root: HTMLElement, attr: string, id: string): DOMRect | null {
  // The card stands at the first place in document order. A proposal that edits a list item
  // marks the whole list as changed and the item's text with its own marks: when that first
  // place is a block holding a mark, the card stands by the mark, not the whole block.
  const all = [...root.querySelectorAll(`[${attr}="${CSS.escape(id)}"]`)];
  const first = all[0];
  if (!first) return null;
  const el = first.matches(BLOCK)
    ? (all.find((e) => e !== first && !e.matches(BLOCK) && first.contains(e)) ?? first)
    : first;
  const block = el.getBoundingClientRect();
  if (!el.matches(BLOCK)) return block;
  // a new block's rows are its text's lines (`.gotipe-sug-block-ins-text`), not its taller box
  const text = [...el.querySelectorAll(".gotipe-sug-block-ins-text")].find(
    (span) => span.closest(BLOCK) === el,
  );
  const lines = text?.getBoundingClientRect();
  const box =
    lines && lines.height > 0
      ? new DOMRect(block.left, lines.top, block.width, lines.height)
      : block;
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
