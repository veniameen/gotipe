import {
  FONT_FAMILIES,
  FONT_SIZE_LIMITS,
  type FontFamilyName,
  isFontFamily,
} from "../document/text-style";
import { flattenBlocks, getMarksAt } from "../document/tree";
import type { GoTipeEditor } from "../types/editor";
import { type Extension, defineExtension } from "../types/extension";
import { editorScoped } from "./scoped";

export { FONT_FAMILIES, FONT_SIZE_LIMITS };
export type { FontFamilyName };

export interface FontSizeOptions {
  /** Smallest size (px) the commands set; kept within `FONT_SIZE_LIMITS`. */
  min: number;
  /** Largest size (px) the commands set; kept within `FONT_SIZE_LIMITS`. */
  max: number;
}

/** The font family of text: a theme face, never an arbitrary CSS family. */
export const FontFamily = defineExtension({
  name: "fontFamily",
  marks: [
    {
      name: "fontFamily",
      attrs: { family: { type: "enum", values: [...FONT_FAMILIES], required: true } },
      rank: 11,
    },
  ],
});

/** The bounds of an editor's `FontSize`; commands without the extension use the hard ones. */
const sizeBounds = editorScoped<{ min: number; max: number; destroy(): void }>();

function bounds(options: Partial<FontSizeOptions>): FontSizeOptions {
  const clamp = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.min(Math.max(Math.round(value), FONT_SIZE_LIMITS.min), FONT_SIZE_LIMITS.max)
      : fallback;
  const min = clamp(options.min, 10);
  return { min, max: Math.max(min, clamp(options.max, 48)) };
}

function fontSize(options: FontSizeOptions): Extension<FontSizeOptions> {
  const extension = defineExtension<FontSizeOptions>({
    name: "fontSize",
    options,
    marks: [{ name: "fontSize", attrs: { size: { type: "number", required: true } }, rank: 12 }],
    onCreate(editor) {
      sizeBounds.attach(editor, { ...options, destroy() {} });
    },
    onDestroy(editor) {
      sizeBounds.detach(editor);
    },
  });
  return { ...extension, configure: (next) => fontSize(bounds({ ...options, ...next })) };
}

/** The font size of text in px. Commands round and clamp it to `min`..`max` (10..48). */
export const FontSize = fontSize(bounds({}));

/**
 * Attributes of `markType` where the selection starts: at a caret as typed text would get
 * them (the stored marks), over text those of its first character. Null without the mark.
 */
function activeMark(editor: GoTipeEditor, markType: string): Record<string, unknown> | null {
  const { toolbar, selection, blocks } = editor.getViewState();
  if (selection.type === "text" && !collapsed(editor)) {
    const order = flattenBlocks(blocks).map((block) => block.id);
    const { anchor, head } = selection;
    const a = order.indexOf(anchor.blockId);
    const b = order.indexOf(head.blockId);
    const start = a < b || (a === b && anchor.offset <= head.offset) ? anchor : head;
    const mark = getMarksAt(blocks, start.blockId, start.offset, false).find(
      (item) => item.type === markType,
    );
    return mark?.attrs ?? null;
  }
  if (!toolbar.activeMarks.includes(markType)) return null;
  return toolbar.activeMarkAttrs?.[markType] ?? null;
}

function collapsed(editor: GoTipeEditor): boolean {
  const { selection } = editor.getViewState();
  return (
    selection.type === "text" &&
    selection.anchor.blockId === selection.head.blockId &&
    selection.anchor.offset === selection.head.offset
  );
}

/**
 * Runs one mark command as one undoable step. Over selected text a transaction that changes
 * nothing is cancelled, so it records no undo step and the command returns false.
 */
function apply(
  editor: GoTipeEditor,
  markType: string,
  attrs: Record<string, unknown> | null,
  same: (current: Record<string, unknown> | null) => boolean,
): boolean {
  if (!editor.isEditable) return false;
  if (collapsed(editor)) {
    if (same(activeMark(editor, markType))) return false;
    const chain = editor.chain();
    return (attrs ? chain.setMark(markType, attrs) : chain.unsetMark(markType)).run();
  }
  const remove = editor.addTransactionFilter(
    ({ before, after }) => JSON.stringify(before.blocks) !== JSON.stringify(after.blocks),
  );
  try {
    const chain = editor.chain();
    return (attrs ? chain.setMark(markType, attrs) : chain.unsetMark(markType)).run();
  } finally {
    remove();
  }
}

/** Sets the family of the selected text (or of the text typed at the caret). */
export function setFontFamily(editor: GoTipeEditor, family: FontFamilyName): boolean {
  if (!isFontFamily(family)) return false;
  return apply(editor, "fontFamily", { family }, (current) => current?.family === family);
}

/** Returns the selected text (or the caret) to the default family. */
export function unsetFontFamily(editor: GoTipeEditor): boolean {
  return apply(editor, "fontFamily", null, (current) => current === null);
}

/** Family at the selection anchor (the stored marks at a caret); null for the default. */
export function getFontFamily(editor: GoTipeEditor): FontFamilyName | null {
  const family = activeMark(editor, "fontFamily")?.family;
  return isFontFamily(family) ? family : null;
}

/**
 * Sets the size (px) of the selected text (or of the text typed at the caret), rounded and
 * clamped to the `FontSize` options, or to `FONT_SIZE_LIMITS` without the extension.
 */
export function setFontSize(editor: GoTipeEditor, size: number): boolean {
  if (typeof size !== "number" || !Number.isFinite(size)) return false;
  const { min, max } = sizeBounds.get(editor) ?? FONT_SIZE_LIMITS;
  const value = Math.min(Math.max(Math.round(size), min), max);
  return apply(editor, "fontSize", { size: value }, (current) => current?.size === value);
}

/** Returns the selected text (or the caret) to the default size. */
export function unsetFontSize(editor: GoTipeEditor): boolean {
  return apply(editor, "fontSize", null, (current) => current === null);
}

/** Size (px) at the selection anchor (the stored marks at a caret); null for the default. */
export function getFontSize(editor: GoTipeEditor): number | null {
  const size = activeMark(editor, "fontSize")?.size;
  return typeof size === "number" && Number.isFinite(size) ? size : null;
}
