import type { Block, Mark, TextSpan } from "@gotipe/core";
import { UnsupportedContent } from "./unsupported";

/** Appends text to rich text, joining it with the last span when the marks are the same. */
export function append(spans: TextSpan[], text: string, marks: Mark[] = []): void {
  const last = spans.at(-1);
  if (last && JSON.stringify(last.marks) === JSON.stringify(marks)) last.text += text;
  else spans.push({ text, marks });
}

const LISTS = new Set(["bulletList", "orderedList", "todoList"]);

/** Whether `writeLines` can write a block of this type as text. */
export function hasLines(type: string): boolean {
  return type === "paragraph" || type === "heading" || LISTS.has(type);
}

function hasText(block: Block): boolean {
  return Array.isArray(block.content) && block.content.some((span) => span.text !== "");
}

/** Lexical keeps a nested list in an item of its own, without text; it has no line or number. */
function holdsOnlyLists(item: Block): boolean {
  return (
    !hasText(item) &&
    item.children.length > 0 &&
    item.children.every((child) => LISTS.has(child.type))
  );
}

/**
 * Appends blocks to rich text as lines, keeping their marks: paragraphs and headings with their
 * text, list items after their marker (`• `, `1. `, `☐ `, `☑ `), nested blocks indented by two
 * spaces per level. Returns every block written, outer blocks first. `started` tells whether
 * the text already holds a line. Throws `UnsupportedContent` for a block without a text form.
 */
export function writeLines(
  text: TextSpan[],
  blocks: Block[],
  into: string,
  started: boolean,
): Block[] {
  const written: Block[] = [];
  let first = !started;
  const line = (prefix: string, block: Block) => {
    if (!first) append(text, "\n");
    first = false;
    if (prefix) append(text, prefix);
    if (Array.isArray(block.content))
      for (const span of block.content) append(text, span.text, span.marks);
  };
  const write = (block: Block, depth: number): void => {
    written.push(block);
    const indent = "  ".repeat(depth);
    if (block.type === "paragraph" || block.type === "heading") {
      line(indent, block);
      return;
    }
    if (!LISTS.has(block.type))
      throw new UnsupportedContent(`${block.type} cannot become text of ${into}`);
    let number = typeof block.attrs.start === "number" ? block.attrs.start : 1;
    for (const item of block.children) {
      written.push(item);
      if (!holdsOnlyLists(item)) {
        const checked = item.attrs.checked === true ? "☑ " : "☐ ";
        const marker =
          block.type === "orderedList"
            ? `${number++}. `
            : block.type === "todoList"
              ? checked
              : "• ";
        line(indent + marker, item);
      }
      for (const child of item.children) write(child, depth + 1);
    }
  };
  for (const block of blocks) write(block, 0);
  return written;
}
