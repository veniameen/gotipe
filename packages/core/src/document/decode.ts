import { GoTipeError } from "../error";
import type { Block, BlockContent, Document, Mark, TextSpan } from "../types/block";
import { cloneAttributes } from "./attributes";

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new GoTipeError("VALIDATION_ERROR", `${label} must be an object`);
  return value as Record<string, unknown>;
}
function name(value: unknown, label: string): string {
  if (typeof value !== "string" || !value)
    throw new GoTipeError("VALIDATION_ERROR", `${label} must be a non-empty string`);
  return value;
}
function attrs(value: unknown) {
  return cloneAttributes(value === undefined ? {} : object(value, "Attributes"));
}
function mark(value: unknown): Mark {
  const entry = object(value, "Mark");
  return { type: name(entry.type ?? entry.mark_type, "Mark type"), attrs: attrs(entry.attrs) };
}
function spans(value: unknown): TextSpan[] {
  if (!Array.isArray(value))
    throw new GoTipeError("VALIDATION_ERROR", "Rich text must be an array");
  return value.map((value) => {
    const span = object(value, "Text span");
    if (typeof span.text !== "string")
      throw new GoTipeError("VALIDATION_ERROR", "Text span text must be a string");
    if (span.marks !== undefined && !Array.isArray(span.marks))
      throw new GoTipeError("VALIDATION_ERROR", "Marks must be an array");
    return { text: span.text, marks: (span.marks ?? []).map(mark) };
  });
}
function content(value: unknown): BlockContent {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return spans(value);
  const tagged = object(value, "Block content");
  if (tagged.type === "Empty") return null;
  if (tagged.type === "Raw" && typeof tagged.value === "string") return tagged.value;
  if (tagged.type === "RichText") return spans(tagged.value);
  throw new GoTipeError("VALIDATION_ERROR", "Unsupported block content");
}

/** Validates the canonical document shape; accepts the equivalent Rust wire representation. */
export function decodeDocument(value: unknown): Document {
  const document = object(value, "Document");
  if (!Array.isArray(document.blocks))
    throw new GoTipeError("VALIDATION_ERROR", "Document blocks must be an array");
  const version = document.version ?? 1;
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 0)
    throw new GoTipeError(
      "VALIDATION_ERROR",
      "Document version must be a non-negative safe integer",
    );
  const ids = new Set<string>();
  let count = 0;
  const block = (value: unknown, depth: number): Block => {
    if (depth > 64 || ++count > 100000)
      throw new GoTipeError("VALIDATION_ERROR", "Document structure exceeds supported limits");
    const entry = object(value, "Block");
    const id = name(entry.id, "Block ID");
    if (ids.has(id)) throw new GoTipeError("VALIDATION_ERROR", `Duplicate block ID: ${id}`);
    ids.add(id);
    if (entry.children !== undefined && !Array.isArray(entry.children))
      throw new GoTipeError("VALIDATION_ERROR", "Block children must be an array");
    return {
      id,
      type: name(entry.type ?? entry.block_type, "Block type"),
      attrs: attrs(entry.attrs),
      content: content(entry.content),
      children: (entry.children ?? []).map((child) => block(child, depth + 1)),
    };
  };
  return { version, blocks: document.blocks.map((entry) => block(entry, 0)) };
}
