import type { Step } from "../types/state";
import { insertionMarks, replaceStructuredSelection } from "./selection-edit";
import { type InputHost, reportInputError, resolveSelectionForInput } from "./session";

export function insertInputText(data: string, host: InputHost): void {
  const selection = resolveSelectionForInput(host);
  if (!selection.anchor.blockId) return;
  try {
    const marks = insertionMarks(host, selection);
    let caret: { blockId: string; offset: number } | null;
    if (selection.type !== "text" || selection.anchor.blockId !== selection.head.blockId) {
      caret = replaceStructuredSelection(host, selection, [{ text: data, marks }]);
    } else {
      const from = Math.min(selection.anchor.offset, selection.head.offset);
      const to = Math.max(selection.anchor.offset, selection.head.offset);
      const blockId = selection.anchor.blockId;
      const steps: Step[] = [];
      if (from !== to) steps.push({ type: "deleteText", blockId, from, to });
      steps.push({ type: "insertText", blockId, offset: from, text: data, marks });
      const after = { blockId, offset: from + data.length };
      host.handled = true;
      caret = host.dispatch({ steps, selection: { type: "cursor", ...after } }) ? after : null;
    }
    host.scheduleSelectionRestore();
    // A rejected input (a filter, a character limit) changed nothing: no input rule runs on
    // the text that was there, and stored marks wait for the next character.
    if (!caret) return;
    host.storedMarks = null;
    host.runInputRules(caret.blockId, caret.offset, data);
  } catch (error) {
    reportInputError(host, error);
  }
}

export function handleTextInput(event: InputEvent, host: InputHost): void {
  const data = event.inputType === "insertLineBreak" ? "\n" : event.data;
  if (!data) return;
  event.preventDefault();
  insertInputText(data, host);
}
