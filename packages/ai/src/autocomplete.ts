import { type GoTipeEditor, createId, isInsideWidget } from "@gotipe/core";
import { type AiTarget, flatten, textOf } from "./document";
import type { AiManager } from "./manager";
import { reportAiError } from "./runtime";

/** Ghost text has a separate abort signal and only consumes keys from its editor. */
export function installAutocomplete(
  editor: GoTipeEditor,
  manager: AiManager,
  debounceMs: number,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let ghost: { text: string; blockId: string; offset: number; target: AiTarget } | undefined;
  let disposed = false;
  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    controller?.abort();
    controller = undefined;
    if (ghost && !editor.isDestroyed) editor.emit("aiGhostTextChange", null);
    ghost = undefined;
  };
  const unsubscribe = editor.on("viewStateChange", () => {
    clear();
    if (!editor.isEditable || editor.isDestroyed || manager.processing || !manager.getProvider())
      return;
    const delay = Number.isFinite(debounceMs) ? Math.max(0, debounceMs) : 500;
    timer = setTimeout(() => {
      timer = undefined;
      if (disposed || !editor.isEditable || manager.processing) return;
      const element = editor.element;
      if (!element || !element.contains(element.ownerDocument.activeElement)) return;
      const target = manager.captureTarget();
      const selection = target.selection;
      const block = flatten(editor.getJSON().blocks).find(
        (item) => item.id === selection.anchor.blockId,
      );
      if (!block || selection.anchor.offset !== textOf(block).length) return;
      if (
        selection.type !== "text" ||
        selection.anchor.blockId !== selection.head.blockId ||
        selection.anchor.offset !== selection.head.offset
      )
        return;
      const abort = new AbortController();
      controller = abort;
      void (async () => {
        let text = "";
        for await (const chunk of manager.streamCompletion(abort.signal)) {
          if (disposed || abort.signal.aborted) return;
          text += chunk;
          ghost = {
            text,
            blockId: selection.anchor.blockId,
            offset: selection.anchor.offset,
            target,
          };
          editor.emit("aiGhostTextChange", { text, blockId: ghost.blockId, offset: ghost.offset });
        }
      })().catch((error) => reportAiError(editor, error));
    }, delay);
  });
  const keydown = (event: KeyboardEvent) => {
    // a key in a widget inside the text (a host's field, a button) is not the text's
    if (
      !ghost ||
      !editor.isEditable ||
      event.isComposing ||
      !(event.target instanceof Node) ||
      !editor.element?.contains(event.target) ||
      isInsideWidget(event.target, editor.element)
    )
      return;
    if (
      event.key === "Tab" &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      event.stopPropagation();
      const captured = ghost;
      clear();
      try {
        manager.applySuggestion(
          { id: createId(), type: "completion", content: captured.text, confidence: 1 },
          captured.target,
        );
      } catch (error) {
        reportAiError(editor, error);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      clear();
    }
  };
  const blur = editor.on("blur", clear);
  const readonly = editor.on("editableChange", (editable) => {
    if (!editable) clear();
  });
  const owner =
    editor.element?.ownerDocument ?? (typeof document === "undefined" ? undefined : document);
  owner?.addEventListener("keydown", keydown, true);
  return () => {
    disposed = true;
    clear();
    unsubscribe();
    readonly();
    blur();
    owner?.removeEventListener("keydown", keydown, true);
  };
}
