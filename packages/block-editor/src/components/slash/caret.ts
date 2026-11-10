import type { GoTipeEditor } from "@gotipe/core";
import type { SlashTrigger } from "./model";
const MAX_CARET_RECT_WIDTH = 48;

function isUsableRect(rect: DOMRect | null): rect is DOMRect {
  if (!rect) return false;
  if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top)) return false;
  return rect.width > 0 || rect.height > 0;
}

function isCaretLikeRect(rect: DOMRect | null): rect is DOMRect {
  if (!isUsableRect(rect)) return false;
  return rect.width <= MAX_CARET_RECT_WIDTH;
}

function getBlockElementFromNode(node: Node | null): HTMLElement | null {
  if (!node) return null;
  const anchorEl = node instanceof Element ? node : node.parentElement;
  return (anchorEl?.closest("[data-block-id]") as HTMLElement | null) ?? null;
}

function getTextHostForBlock(blockEl: HTMLElement): HTMLElement {
  const marked = Array.from(
    blockEl.querySelectorAll<HTMLElement>("[data-gotipe-text-content]"),
  ).find((element) => element.closest("[data-block-id]") === blockEl);
  if (marked) return marked;
  const blockType = blockEl.getAttribute("data-block-type");
  if (blockType === "todoItem") {
    return (blockEl.querySelector("[data-gotipe-todo-content]") as HTMLElement | null) ?? blockEl;
  }
  if (blockType === "callout") {
    return (blockEl.querySelector(".gotipe-callout-content") as HTMLElement | null) ?? blockEl;
  }
  return blockEl;
}

function getPreviousCharacterRect(range: Range, blockEl: HTMLElement): DOMRect | null {
  try {
    const probe = document.createRange();
    probe.setStart(blockEl, 0);
    probe.setEnd(range.startContainer, range.startOffset);
    const absoluteOffset = probe.toString().length;
    if (absoluteOffset <= 0) return null;

    const textHost = getTextHostForBlock(blockEl);
    const walker = document.createTreeWalker(textHost, NodeFilter.SHOW_TEXT);
    let accumulated = 0;
    let node: Node | null;
    for (node = walker.nextNode(); node; node = walker.nextNode()) {
      const textNode = node as Text;
      const len = (textNode.textContent ?? "").length;
      if (len === 0) continue;
      if (accumulated + len >= absoluteOffset) {
        const localEnd = Math.min(len, absoluteOffset - accumulated);
        const localStart = Math.max(0, localEnd - 1);
        const charRange = document.createRange();
        charRange.setStart(textNode, localStart);
        charRange.setEnd(textNode, localEnd);
        const rect = charRange.getBoundingClientRect();
        return isUsableRect(rect) ? rect : null;
      }
      accumulated += len;
    }
  } catch {
    // Continue with anchor fallbacks when range endpoints are stale.
  }
  return null;
}

function getRangeCaretRect(collapsedRange: Range): DOMRect | null {
  const blockEl = getBlockElementFromNode(collapsedRange.startContainer);

  const rects = Array.from(collapsedRange.getClientRects());
  const lastRect = rects.length > 0 ? rects[rects.length - 1]! : null;
  if (isCaretLikeRect(lastRect)) return lastRect;

  const collapsedRect = collapsedRange.getBoundingClientRect();
  if (isCaretLikeRect(collapsedRect)) return collapsedRect;

  if (blockEl) {
    const prevRect = getPreviousCharacterRect(collapsedRange, blockEl);
    if (isUsableRect(prevRect)) return prevRect;

    const anchorRect = blockEl.getBoundingClientRect();
    if (isUsableRect(anchorRect)) return anchorRect;
  }

  return null;
}

function resolveDomPointInBlock(
  blockEl: HTMLElement,
  targetOffset: number,
): { node: Node; offset: number } {
  const textHost = getTextHostForBlock(blockEl);
  const walker = document.createTreeWalker(textHost, NodeFilter.SHOW_TEXT);
  let accumulated = 0;
  let lastTextNode: Node | null = null;
  let textNode: Node | null;

  for (textNode = walker.nextNode(); textNode; textNode = walker.nextNode()) {
    lastTextNode = textNode;
    const len = (textNode.textContent ?? "").length;
    if (accumulated + len >= targetOffset) {
      return { node: textNode, offset: Math.min(Math.max(0, targetOffset - accumulated), len) };
    }
    accumulated += len;
  }

  if (!lastTextNode) {
    return { node: textHost, offset: 0 };
  }

  const lastLen = (lastTextNode.textContent ?? "").length;
  return { node: lastTextNode, offset: lastLen };
}

export function getCaretClientRectFromTrigger(
  editor: GoTipeEditor,
  trigger: SlashTrigger | null,
): DOMRect | null {
  if (!trigger) return null;
  const blockEl = editor.element?.querySelector(
    `[data-block-id="${CSS.escape(trigger.blockId)}"]`,
  ) as HTMLElement | null;
  if (!blockEl) return null;
  const point = resolveDomPointInBlock(blockEl, trigger.to);
  const range = document.createRange();
  range.setStart(point.node, point.offset);
  range.collapse(true);
  return getRangeCaretRect(range);
}

export function getCaretClientRect(editor: GoTipeEditor): DOMRect | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !editor.element?.contains(selection.anchorNode))
    return null;

  const collapsed = selection.getRangeAt(0).cloneRange();
  collapsed.collapse(true);
  return getRangeCaretRect(collapsed);
}
