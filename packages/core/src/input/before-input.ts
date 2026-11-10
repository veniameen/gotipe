import { findBlockInTree } from "../document/tree";
import { ownsInputTarget } from "../dom/input-owner";
import { handleBackwardDelete, handleForwardDelete } from "./delete-input";
import { handleParagraphInput } from "./paragraph-input";
import { type InputHost, resolveSelectionForInput } from "./session";
import { handleTextInput, insertInputText } from "./text-input";

export function installBeforeInput(
  element: HTMLElement,
  signal: AbortSignal,
  host: InputHost,
): void {
  element.addEventListener(
    "beforeinput",
    (event) => {
      if (!ownsInputTarget(element, event.target)) return;
      if (!host.editable) {
        event.preventDefault();
        return;
      }
      const type = event.inputType;
      if (
        host.composing &&
        ["insertCompositionText", "deleteCompositionText", "insertFromComposition"].includes(type)
      )
        return;
      const enterMode = host.enterMode;
      if (type === "insertParagraph" || type === "insertLineBreak") {
        host.enterMode = null;
        // WebKit can label Shift+Enter as insertParagraph. The trusted key
        // intent still owns the distinction between a soft break and a split.
        if (enterMode === "shift") {
          event.preventDefault();
          insertInputText("\n", host);
          return;
        }
      }
      let paragraphBreak = type === "insertParagraph";
      if (type === "insertLineBreak") {
        const selection = resolveSelectionForInput(host);
        const block = findBlockInTree(host.getViewState().blocks, selection.anchor.blockId);
        paragraphBreak = enterMode !== "shift" && block?.type !== "codeBlock";
      }
      if (
        type === "insertText" ||
        type === "insertCompositionText" ||
        (type === "insertLineBreak" && !paragraphBreak)
      )
        handleTextInput(event, host);
      else if (paragraphBreak) handleParagraphInput(event, host);
      else if (
        [
          "deleteContentBackward",
          "deleteWordBackward",
          "deleteSoftLineBackward",
          "deleteHardLineBackward",
        ].includes(type)
      )
        handleBackwardDelete(event, host);
      else if (
        [
          "deleteContentForward",
          "deleteWordForward",
          "deleteSoftLineForward",
          "deleteHardLineForward",
        ].includes(type)
      )
        handleForwardDelete(event, host);
    },
    { signal },
  );
}
