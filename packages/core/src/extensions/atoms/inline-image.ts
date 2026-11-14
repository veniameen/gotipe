import { toSafeImageSrc } from "../../security/urls";
import type { AttrValue } from "../../types/block";
import type { GoTipeEditor } from "../../types/editor";
import { defineExtension } from "../../types/extension";
import { type AtomTarget, insertAtom } from "./commands";
import { INLINE_ATOM_SUPPORT } from "./support";

export interface InlineImageAttrs {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
}

/**
 * An image inside a line: its alt text carrying the atomic `inlineImage` mark with `src`,
 * `alt`, `width` and `height`. Markdown writes `![alt](src)` inside a paragraph, HTML an
 * `<img>` with the same address checks as image blocks.
 */
export const InlineImage = defineExtension({
  name: "inlineImage",
  atomSupport: INLINE_ATOM_SUPPORT,
  marks: [
    {
      name: "inlineImage",
      attrs: {
        src: { type: "string", required: true },
        alt: { type: "string", default: "" },
        width: { type: "number" },
        height: { type: "number" },
        key: { type: "string" },
      },
      rank: 230,
      atomic: true,
    },
  ],
});

/** The text of an inline image: its alt, else its file name, else `image` (as Markdown reads it). */
export function inlineImageText(src: string, alt = ""): string {
  if (alt) return alt;
  if (/^data:/i.test(src)) return "image";
  const path = src.replace(/[?#].*$/s, "");
  return path.slice(path.lastIndexOf("/") + 1) || "image";
}

const size = (value: number | undefined) =>
  value !== undefined && Number.isInteger(value) && value > 0 ? value : undefined;

/** Inserts an image at the selection; false for an unsafe address. */
export function insertInlineImage(
  editor: GoTipeEditor,
  attrs: InlineImageAttrs,
  range?: AtomTarget,
): boolean {
  const src = toSafeImageSrc(attrs.src);
  if (!src) return false;
  const alt = (attrs.alt ?? "").replace(/\r\n?|\n/g, " ");
  const mark: Record<string, AttrValue> = { src, alt };
  const width = size(attrs.width);
  const height = size(attrs.height);
  if (width) mark.width = width;
  if (height) mark.height = height;
  return insertAtom(editor, "inlineImage", inlineImageText(src, alt), mark, range);
}
