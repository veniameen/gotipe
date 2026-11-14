import { getBlockTextLeft } from "../interaction/block-text-metrics";

/**
 * Right to left blocks (Atlas frame 28): a block whose own or automatic direction is RTL keeps
 * its handle in the right gutter, where its lines start. `dir="auto"` resolves in the browser.
 */
export function isRightToLeft(block: Element): boolean {
  try {
    if (block.matches(":dir(rtl)")) return true;
    if (block.matches(":dir(ltr)")) return false;
  } catch {
    // A browser without :dir() reads the computed direction below.
  }
  return getComputedStyle(block).direction === "rtl";
}

const handleOffset = (container: HTMLElement) => {
  const value = Number.parseFloat(
    getComputedStyle(container).getPropertyValue("--gt-handle-offset"),
  );
  return Number.isFinite(value) ? value : 0;
};

/**
 * Where the handle of an RTL block stands: `right`, from the container's right edge to the
 * handle's, so the handle sits `--gt-handle-offset` past the text column's right edge. `null`
 * when the right gutter is narrower than that (a narrow container gives its room to the left
 * rail only): the handle then stays on the left rather than cover the text.
 */
export function rightRail(container: HTMLElement, block: HTMLElement): number | null {
  const content = container.querySelector<HTMLElement>("[data-gotipe-content]") ?? container;
  const column = content.getBoundingClientRect();
  const style = getComputedStyle(content);
  const columnRight = column.right - Number.parseFloat(style.paddingRight || "0");
  const right = Math.min(columnRight, block.getBoundingClientRect().right);
  const room = container.getBoundingClientRect().right - right - handleOffset(container);
  return room < 0 ? null : Math.round(room);
}

/** The pointer is near enough to a block's start for its handle: before or over its text. */
export function inHandleReach(
  container: HTMLElement,
  block: HTMLElement,
  clientX: number,
  before: number,
  after: number,
): boolean {
  if (isRightToLeft(block) && rightRail(container, block) !== null) {
    const start = block.getBoundingClientRect().right;
    return clientX <= start + before && clientX >= start - after;
  }
  const start = getBlockTextLeft(block);
  return clientX >= start - before && clientX <= start + after;
}

/** The handle's place beside `block`: the shared left rail, or the right gutter of an RTL block. */
export function handleRail(
  container: HTMLElement,
  block: HTMLElement,
  left: (container: HTMLElement) => number,
): { left: number; right: number | null } {
  const right = isRightToLeft(block) ? rightRail(container, block) : null;
  return right === null ? { left: left(container), right: null } : { left: 0, right };
}
