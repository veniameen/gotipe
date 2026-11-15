import { documentTransaction, entries } from "../clipboard/document";
import { insertPayload } from "../clipboard/insertion";
import { removeSelection } from "../clipboard/selection";
import { cloneAttributes } from "../document/attributes";
import { getMarksAt } from "../document/tree";
import { GoTipeError } from "../error";
import type { Mark, TextSpan } from "../types/block";
import type { MarkView, SelectionView } from "../types/view";
import type { InputHost, TypingKind } from "./session";

export function hasSelection(selection: SelectionView): boolean {
  return (
    selection.type !== "text" ||
    selection.anchor.blockId !== selection.head.blockId ||
    selection.anchor.offset !== selection.head.offset
  );
}

export function insertionMarks(host: InputHost, selection: SelectionView): Mark[] {
  let marks: MarkView[];
  if (host.storedMarks !== null) marks = host.storedMarks;
  else {
    let start = selection.anchor;
    if (hasSelection(selection)) {
      const ids = entries(host.getDocument().blocks).map(({ block }) => block.id);
      const a = ids.indexOf(selection.anchor.blockId);
      const b = ids.indexOf(selection.head.blockId);
      if (b < a || (b === a && selection.head.offset < start.offset)) start = selection.head;
    }
    marks = getMarksAt(
      host.getViewState().blocks,
      start.blockId,
      start.offset,
      !hasSelection(selection),
    );
  }
  return marks.map((mark) => ({ type: mark.type, attrs: cloneAttributes(mark.attrs) }));
}

/** Replaces the selection with `spans`, or removes it without them. */
export function replaceStructuredSelection(
  host: InputHost,
  selection: SelectionView,
  typing: TypingKind | undefined,
  spans?: TextSpan[],
) {
  const before = host.getDocument();
  const change = spans
    ? insertPayload(before, selection, { spans })
    : removeSelection(before, selection);
  if (!change) throw new GoTipeError("TRANSFORM_ERROR", "The selection is no longer valid");
  host.handled = true;
  // Selected text, also across blocks, starts the step that the next input joins; whole
  // selected blocks are a step of their own. `null`: a transaction filter rejected the change.
  const kind = selection.type === "text" ? typing : undefined;
  return host.dispatch(documentTransaction(before, change.document, change.caret), kind)
    ? change.caret
    : null;
}
