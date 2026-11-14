import { cloneAttributes } from "../../document/attributes";
import { findBlockInTree, getMarksAt } from "../../document/tree";
import { newAtomKey } from "../../engine/atom-keys";
import { viewAtoms } from "../../engine/atoms";
import type { AttrValue, Mark } from "../../types/block";
import type { GoTipeEditor } from "../../types/editor";
import type { Step } from "../../types/state";
import type { BlockView } from "../../types/view";

/** Where an atom goes: a range of one block's text (a suggestion's range), else the selection. */
export interface AtomTarget {
  blockId: string;
  from: number;
  to: number;
}

/** A located atom: its block, `[from, to)`, its text and its atomic mark. */
export interface AtomInfo extends AtomTarget {
  text: string;
  mark: Mark;
}

function spansOf(editor: GoTipeEditor, blockId: string): BlockView["content"] {
  return findBlockInTree(editor.getViewState().blocks, blockId)?.content ?? null;
}

function selectionTarget(editor: GoTipeEditor): AtomTarget | null {
  const { selection } = editor.getViewState();
  if (selection.type !== "text" || selection.anchor.blockId !== selection.head.blockId) return null;
  const { anchor, head } = selection;
  return {
    blockId: anchor.blockId,
    from: Math.min(anchor.offset, head.offset),
    to: Math.max(anchor.offset, head.offset),
  };
}

/**
 * Inserts `text` as one atom with the mark `type` in one undoable step, replacing `target`
 * (else the selection) and leaving the caret after it. The atom keeps the formatting of the
 * text before it but never joins a neighbour: every new atom takes a fresh, unique `key`.
 */
export function insertAtom(
  editor: GoTipeEditor,
  type: string,
  text: string,
  attrs: Record<string, AttrValue>,
  target?: AtomTarget,
): boolean {
  const place = target ?? selectionTarget(editor);
  const fallback = text.replace(/\r\n?|\n/g, " ");
  if (!editor.isEditable || !place || !fallback) return false;
  const content = spansOf(editor, place.blockId);
  if (!Array.isArray(content)) return false;
  const length = content.reduce((sum, span) => sum + span.text.length, 0);
  if (place.from < 0 || place.to < place.from || place.to > length) return false;
  const mark: Mark = { type, attrs: cloneAttributes({ ...attrs, key: newAtomKey() }) };
  const inherited = getMarksAt(editor.getViewState().blocks, place.blockId, place.from).map(
    (item) => ({ type: item.type, attrs: cloneAttributes(item.attrs) }) as Mark,
  );
  const steps: Step[] = [];
  if (place.to > place.from)
    steps.push({ type: "deleteText", blockId: place.blockId, from: place.from, to: place.to });
  steps.push({
    type: "insertText",
    blockId: place.blockId,
    offset: place.from,
    text: fallback,
    marks: [...inherited.filter((item) => item.type !== type), mark],
  });
  return editor.dispatch({
    steps,
    selection: { type: "cursor", blockId: place.blockId, offset: place.from + fallback.length },
  });
}

/**
 * The atom with a mark of `type` at `offset` of `blockId`: the one containing it, else the
 * one ending there (the caret after it), else the one starting there.
 */
export function findAtom(
  editor: GoTipeEditor,
  type: string,
  at?: { blockId: string; offset: number },
): AtomInfo | null {
  const point = at ?? editor.getViewState().selection.head;
  const content = spansOf(editor, point.blockId);
  if (!Array.isArray(content)) return null;
  const atoms = viewAtoms(content).filter((atom) => atom.marks.some((m) => m.type === type));
  const atom =
    atoms.find((item) => item.from < point.offset && point.offset < item.to) ??
    atoms.find((item) => item.to === point.offset) ??
    atoms.find((item) => item.from === point.offset);
  if (!atom) return null;
  const mark = atom.marks.find((item) => item.type === type)!;
  const text = content.map((span) => span.text).join("");
  return {
    blockId: point.blockId,
    from: atom.from,
    to: atom.to,
    text: text.slice(atom.from, atom.to),
    mark: { type, attrs: cloneAttributes((mark.attrs ?? {}) as Mark["attrs"]) },
  };
}

/**
 * Changes the attributes of an atom (and its text, when given) in one undoable step.
 * Attributes left out keep their values, `null` clears one. New attributes keep the atom's
 * `key`; new text makes it a new atom with a fresh key, so a peer's repair
 * (`normalizeRemoteAtoms`) never takes the rewrite for text typed into the old one.
 */
export function updateAtom(
  editor: GoTipeEditor,
  atom: AtomInfo,
  attrs: Record<string, AttrValue>,
  text?: string,
): boolean {
  if (!editor.isEditable) return false;
  const merged: Record<string, AttrValue> = { ...atom.mark.attrs };
  for (const [name, value] of Object.entries(attrs))
    if (value === null) delete merged[name];
    else merged[name] = value;
  const mark: Mark = { type: atom.mark.type, attrs: cloneAttributes(merged) };
  const fallback = text?.replace(/\r\n?|\n/g, " ");
  if (fallback === undefined || fallback === atom.text)
    return editor.dispatch({
      steps: [{ type: "addMark", blockId: atom.blockId, from: atom.from, to: atom.to, mark }],
    });
  if (!fallback) return false;
  mark.attrs.key = newAtomKey();
  // The other marks of the atom's first character stay on the new text.
  const others = getMarksAt(editor.getViewState().blocks, atom.blockId, atom.from, false).map(
    (item) => ({ type: item.type, attrs: cloneAttributes(item.attrs) }) as Mark,
  );
  return editor.dispatch({
    steps: [
      { type: "deleteText", blockId: atom.blockId, from: atom.from, to: atom.to },
      {
        type: "insertText",
        blockId: atom.blockId,
        offset: atom.from,
        text: fallback,
        marks: [...others, mark],
      },
    ],
    selection: { type: "cursor", blockId: atom.blockId, offset: atom.from + fallback.length },
  });
}
