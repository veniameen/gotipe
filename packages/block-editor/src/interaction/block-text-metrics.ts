/**
 * Where a block starts for its handle (D-261): the first line of its content. Metrics belong to
 * the block itself, never to a nested block or to its controls (buttons, fields, tooltips).
 */
const HIDDEN = '.gotipe-tip, .gotipe-sr-only, [aria-hidden="true"]';
const FIELD = "button, input, textarea, select";
/** Content that is not text: a picture or a rule starts its block's first row. */
const PICTURE = "img, video, iframe, canvas, hr";

type Lead = { rect: DOMRect; row: boolean };

/** Text takes the caret when nothing between it and its block is a widget. */
function isEditable(block: Element, element: Element): boolean {
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (node.hasAttribute("data-gotipe-widget") || node.getAttribute("contenteditable") === "false")
      return false;
    if (node === block) return true;
  }
  return true;
}

function firstCharacterRect(node: Text): DOMRect | null {
  const text = node.textContent ?? "";
  const start = text.search(/\S/);
  if (start < 0) return null;
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, start + 1);
  const rect = range.getBoundingClientRect();
  return rect.height > 0 && rect.width > 0 ? rect : null;
}

const hasBox = (rect: DOMRect) => rect.height > 0 || rect.width > 0;

/**
 * The block's lead, in document order: its first editable text or picture (a formula's TeX, the
 * first line of code, an image above its caption); then the caret line of an empty block; then
 * the lead of its first nested block (a table's first cell); then the first text or field it
 * shows (a file's name, a link card's site, the field of an empty one).
 */
function blockLead(block: HTMLElement): Lead | null {
  let shown: Lead | null = null;
  const visit = (element: Element): Lead | null => {
    for (const child of Array.from(element.childNodes)) {
      if (child instanceof Text) {
        const rect = firstCharacterRect(child);
        if (!rect) continue;
        if (isEditable(block, element)) return { rect, row: false };
        shown ??= { rect, row: false };
        continue;
      }
      if (
        !(child instanceof Element) ||
        child.hasAttribute("data-block-id") ||
        child.matches(HIDDEN)
      )
        continue;
      if (child.matches(FIELD)) {
        const rect = child.getBoundingClientRect();
        if (hasBox(rect)) shown ??= { rect, row: false };
        continue;
      }
      if (child.matches(PICTURE)) {
        const rect = child.getBoundingClientRect();
        if (hasBox(rect)) return { rect, row: true };
        continue;
      }
      const found = visit(child);
      if (found) return found;
    }
    return null;
  };
  const lead = visit(block);
  if (lead) return lead;
  const trailingBreak = Array.from(block.querySelectorAll("br[data-gotipe-trailing-break]")).find(
    (candidate) => candidate.closest("[data-block-id]") === block,
  );
  const breakRect = trailingBreak?.getBoundingClientRect();
  if (breakRect && breakRect.height > 0) return { rect: breakRect, row: false };
  const nested = block.querySelector<HTMLElement>("[data-block-id]");
  return (nested && blockLead(nested)) ?? shown;
}

/** The element of the block's editable text: a block without content is measured on it. */
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

const lineHeight = (element: Element, fallback: number) => {
  const value = Number.parseFloat(getComputedStyle(element).lineHeight);
  return Number.isFinite(value) ? value : fallback;
};

export function getBlockTextLeft(block: HTMLElement): number {
  return blockLead(block)?.rect.left ?? textHost(block).getBoundingClientRect().left;
}

export function getBlockFirstLineMetrics(block: HTMLElement): { top: number; height: number } {
  const lead = blockLead(block);
  // a picture or a rule: the handle stands at its first row, a line of the block's text high
  if (lead?.row)
    return {
      top: lead.rect.top,
      height: Math.max(1, Math.min(lead.rect.height, lineHeight(block, lead.rect.height))),
    };
  if (lead) return { top: lead.rect.top, height: lead.rect.height };
  const host = textHost(block);
  const rect = host.getBoundingClientRect();
  return {
    top: rect.top,
    height: Math.max(1, Math.min(rect.height, lineHeight(host, rect.height))),
  };
}
