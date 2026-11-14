import type React from "react";

const FOCUSABLE = 'input, button:not(:disabled), [tabindex="0"]';

/** Keeps Tab inside a popover at the caret: past the last control to the first and back. */
export function wrapTab(event: React.KeyboardEvent, root: HTMLElement | null): void {
  if (event.key !== "Tab" || !root) return;
  const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) return;
  const active = root.ownerDocument.activeElement;
  if (event.shiftKey ? active === first : active === last) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
}

/** The focus moves from the popover to another element of the page (not to the window). */
export const focusLeaves = (event: React.FocusEvent, root: HTMLElement | null): boolean =>
  event.relatedTarget instanceof Node && !root?.contains(event.relatedTarget);
