import { newAtomKey } from "../engine/atom-keys";
import { toSafeImageSrc } from "../security/urls";
import type { HtmlAtomReader, InlineAtomSupport } from "../types/atoms";
import type { Mark } from "../types/block";

const EMOJI = /^:([A-Za-z0-9_+-]+):$/;

/** The text of an inline image: its alt, else its file name, else `image`. */
function imageText(src: string, alt: string): string {
  if (alt) return alt;
  if (/^data:/i.test(src)) return "image";
  const path = src.replace(/[?#].*$/s, "");
  return path.slice(path.lastIndexOf("/") + 1) || "image";
}

const size = (value: string | null) => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 && n <= 10000 ? n : undefined;
};

/**
 * Inline atoms in imported HTML (docs/development/inline-atoms.md), as `serializeHtml`
 * writes them. An atom whose mark the schema lacks, or whose attributes fail, is read as
 * its fallback text; every atom read gets a fresh `key`. The atom extensions supply it
 * (`InlineAtomSupport.readHtml`); without them `html.ts` reads atoms as their text.
 */
export function htmlAtoms(schema: Parameters<InlineAtomSupport["readHtml"]>[0]): HtmlAtomReader {
  const has = (mark: string) => Object.hasOwn(schema.marks, mark);
  return {
    /** Whether a paragraph's images are inline content rather than image blocks. */
    inlineImages(images: readonly Element[]): boolean {
      return (
        images.every((image) => image.getAttribute("data-type") === "emoji") ||
        has("inlineImage") ||
        !Object.hasOwn(schema.nodes, "image")
      );
    },
    /** The atomic mark a `<span data-type>` element adds to its text, or null. */
    span(element: HTMLElement): Mark | null {
      const type = element.getAttribute("data-type");
      if (type === "math" && has("inlineMath"))
        return { type: "inlineMath", attrs: { key: newAtomKey() } };
      const id = element.getAttribute("data-id");
      if (type !== "mention" || !has("mention") || !id) return null;
      const kind = element.getAttribute("data-kind") === "page" ? "page" : "user";
      const text = element.textContent ?? "";
      const label =
        element.getAttribute("data-label") ??
        (kind === "user" && text.startsWith("@") ? text.slice(1) : text);
      return label ? { type: "mention", attrs: { id, label, kind, key: newAtomKey() } } : null;
    },
    /** The text and atomic mark of an inline `<img>`; the mark is null for plain alt text. */
    image(element: HTMLElement): { text: string; mark: Mark | null } {
      const alt = element.getAttribute("alt") ?? "";
      const src = toSafeImageSrc(element.getAttribute("src") ?? "");
      if (element.getAttribute("data-type") === "emoji") {
        const name = EMOJI.exec(alt)?.[1];
        return {
          text: alt,
          mark:
            name && src && has("customEmoji")
              ? { type: "customEmoji", attrs: { name, src, key: newAtomKey() } }
              : null,
        };
      }
      if (!src || !has("inlineImage")) return { text: alt, mark: null };
      const attrs: Mark["attrs"] = { src, alt: alt.replace(/[\r\n]+/g, " "), key: newAtomKey() };
      const width = size(element.getAttribute("width"));
      const height = size(element.getAttribute("height"));
      if (width) attrs.width = width;
      if (height) attrs.height = height;
      return { text: imageText(src, alt), mark: { type: "inlineImage", attrs } };
    },
  };
}
