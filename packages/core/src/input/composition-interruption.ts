import { ownsInputTarget } from "../dom/input-owner";
import type { TextSelection } from "../dom/selection";
import { GoTipeError } from "../error";
import { captureRendererDOM } from "./composition-dom";

/** A canceled native session cannot insert its final payload at a new model caret. */
export function installCompositionInterruption(
  element: HTMLElement,
  signal: AbortSignal,
  port: { reportError(error: GoTipeError): void; restoreSelection(): void },
) {
  let canceled: { text: string; selection: TextSelection; reason: string } | null = null;
  let restoreNativeMutation: (() => void) | null = null;
  const report = () => {
    if (!canceled || signal.aborted) return;
    port.reportError(
      new GoTipeError(
        "COMPOSITION_CONFLICT",
        "A document change interrupted native composition. Recover the input from error.details.",
        { ...canceled, selection: structuredClone(canceled.selection) },
      ),
    );
  };
  const update = (text: string | null) => {
    if (canceled && text && text !== canceled.text) {
      canceled.text = text;
      report();
    }
  };
  const reset = () => {
    canceled = null;
    restoreNativeMutation = null;
  };
  signal.addEventListener("abort", reset, { once: true });
  element.addEventListener(
    "keydown",
    (event) => {
      if (ownsInputTarget(element, event.target) && !event.isComposing && event.keyCode !== 229)
        reset();
    },
    { signal, capture: true },
  );
  element.addEventListener(
    "pointerdown",
    (event) => {
      if (ownsInputTarget(element, event.target)) reset();
    },
    { signal, capture: true },
  );
  element.addEventListener(
    "beforeinput",
    (event) => {
      if (!canceled || !ownsInputTarget(element, event.target)) return;
      if (
        ![
          "insertText",
          "insertCompositionText",
          "deleteCompositionText",
          "insertFromComposition",
        ].includes(event.inputType)
      )
        return;
      update(event.data);
      const restore = captureRendererDOM(element);
      restoreNativeMutation = restore;
      queueMicrotask(() => {
        if (restoreNativeMutation === restore) restoreNativeMutation = null;
      });
      event.preventDefault();
      event.stopImmediatePropagation();
      port.restoreSelection();
    },
    { signal, capture: true },
  );
  element.addEventListener(
    "input",
    (event) => {
      if (!canceled || !ownsInputTarget(element, event.target)) return;
      restoreNativeMutation?.();
      restoreNativeMutation = null;
      event.stopImmediatePropagation();
      port.restoreSelection();
    },
    { signal, capture: true },
  );
  return {
    reset,
    cancel(text: string, selection: TextSelection, reason: string) {
      canceled = { text, selection: structuredClone(selection), reason };
      report();
    },
    finish(text: string): boolean {
      if (!canceled) return false;
      update(text);
      port.restoreSelection();
      // Chromium can send final insertText without compositionend. Only new
      // user intent (key/pointer/start) releases this old session's suppression.
      return true;
    },
  };
}
