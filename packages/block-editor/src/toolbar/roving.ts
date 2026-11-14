import { type FocusEvent, type KeyboardEvent, type RefObject, useLayoutEffect, useRef } from "react";

/** Lists the tools open (a font list, «Insert»): their rows keep their own keys. */
const POPUP = "[data-gotipe-formatting-popup]";

/** The controls of a toolbar line in order: buttons and fields, without those of open lists. */
export function lineControls(line: HTMLElement): HTMLElement[] {
  return Array.from(line.querySelectorAll<HTMLElement>("button, input")).filter(
    (control) => !control.closest(POPUP) && !(control as HTMLButtonElement).disabled,
  );
}

function atEdge(control: HTMLElement, side: "start" | "end"): boolean {
  if (!(control instanceof HTMLInputElement)) return true;
  const { selectionStart, selectionEnd, value } = control;
  if (selectionStart === null || selectionStart !== selectionEnd) return false;
  return side === "start" ? selectionStart === 0 : selectionStart === value.length;
}

/**
 * One Tab stop for a line of tools (WAI-ARIA toolbar): the arrows move between its controls,
 * Home and End go to the first and the last; a field keeps the arrows while its caret is inside
 * the text. Unavailable tools stay in the path, so their tooltip can say why.
 */
export function useRovingFocus(line: RefObject<HTMLElement | null>) {
  const current = useRef(0);
  const settle = (controls: HTMLElement[], index: number) => {
    for (const [at, control] of controls.entries()) control.tabIndex = at === index ? 0 : -1;
  };
  // Tools mount anew when they move between the bar and «More»: the stop is set after each render.
  useLayoutEffect(() => {
    const element = line.current;
    if (!element) return;
    const controls = lineControls(element);
    settle(controls, Math.max(0, Math.min(current.current, controls.length - 1)));
  });
  const onFocus = (event: FocusEvent<HTMLElement>) => {
    const element = line.current;
    if (!element) return;
    const controls = lineControls(element);
    const index = controls.indexOf(event.target as HTMLElement);
    if (index < 0) return;
    current.current = index;
    settle(controls, index);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const element = line.current;
    const target = event.target as HTMLElement;
    if (!element || event.defaultPrevented || target.closest(POPUP)) return;
    const controls = lineControls(element);
    const index = controls.indexOf(target);
    if (index < 0) return;
    const last = controls.length - 1;
    const field = target instanceof HTMLInputElement;
    let next = -1;
    if (event.key === "ArrowRight" && atEdge(target, "end")) next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft" && atEdge(target, "start"))
      next = index === 0 ? last : index - 1;
    else if (event.key === "Home" && !field) next = 0;
    else if (event.key === "End" && !field) next = last;
    if (next < 0) return;
    event.preventDefault();
    controls[next]?.focus();
  };
  return { onFocus, onKeyDown };
}
