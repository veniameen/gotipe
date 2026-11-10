import { cloneAttributes } from "../document/attributes";
import { parseHtmlDocument } from "../html";
import { blocksToText } from "../text";
import type { Block, Mark, TextSpan } from "../types/block";
import { plainTextPayload } from "./insertion";
import type { ClipboardPayload } from "./selection";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function attrs(value: unknown): boolean {
  if (value === undefined) return true;
  if (!record(value)) return false;
  try {
    cloneAttributes(value);
    return true;
  } catch {
    return false;
  }
}
function mark(value: unknown): value is Mark {
  return record(value) && typeof value.type === "string" && !!value.type && attrs(value.attrs);
}
function span(value: unknown): value is TextSpan {
  return (
    record(value) &&
    typeof value.text === "string" &&
    Array.isArray(value.marks) &&
    value.marks.every(mark)
  );
}

/** The internal MIME type is untrusted input too; bound depth and count before cloning. */
export function decodeInternalPayload(json: string): ClipboardPayload | null {
  if (json.length > 8 * 1024 * 1024) return null;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  if (!record(value)) return null;
  if (Array.isArray(value.spans) && value.spans.length && value.spans.every(span)) {
    return {
      spans: value.spans.map((item) => ({
        text: item.text,
        marks: item.marks.map((entry) => ({ type: entry.type, attrs: { ...entry.attrs } })),
      })),
    };
  }
  let count = 0;
  function block(candidate: unknown, depth: number): candidate is Block {
    if (++count > 10000 || depth > 64 || !record(candidate)) return false;
    return (
      typeof candidate.id === "string" &&
      typeof candidate.type === "string" &&
      !!candidate.type &&
      attrs(candidate.attrs) &&
      (candidate.content === null ||
        typeof candidate.content === "string" ||
        (Array.isArray(candidate.content) && candidate.content.every(span))) &&
      Array.isArray(candidate.children) &&
      candidate.children.every((child) => block(child, depth + 1))
    );
  }
  if (
    Array.isArray(value.blocks) &&
    value.blocks.length &&
    value.blocks.every((item) => block(item, 0))
  ) {
    return { blocks: value.blocks };
  }
  return null;
}

export function readClipboardPayload(data: Pick<DataTransfer, "getData">): ClipboardPayload | null {
  const internal = data.getData("application/x-gotipe");
  if (internal) {
    const decoded = decodeInternalPayload(internal);
    if (decoded) return decoded;
  }
  const html = data.getData("text/html");
  if (html) {
    const blocks = parseHtmlDocument(html).blocks;
    if (
      blocks.some((block) => block.type !== "paragraph" || block.children.length) ||
      blocksToText(blocks).length
    ) {
      return { blocks };
    }
  }
  const plain = data.getData("text/plain");
  return plain ? plainTextPayload(plain) : null;
}
