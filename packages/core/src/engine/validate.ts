import { cloneAttributes } from "../document/attributes";
import { decodeDocument } from "../document/decode";
import type { AttrValue, Block, Document } from "../types/block";
import type { toWasmSchema } from "./schema";
import type { FallbackBlock, FallbackDoc } from "./types";

type Schema = ReturnType<typeof toWasmSchema>;
type Attributes = Schema["nodes"][string]["attrs"];
function validAttributes(values: Record<string, AttrValue>, specs: Attributes): boolean {
  for (const [name, spec] of Object.entries(specs))
    if (spec.required && !(name in values)) return false;
  return Object.entries(values).every(([name, value]) => {
    const spec = specs[name];
    if (!spec) return false;
    if (value === null && !spec.required) return true;
    if (typeof spec.attr_type === "object")
      return typeof value === "string" && spec.attr_type.Enum.includes(value);
    switch (spec.attr_type) {
      case "String":
        return typeof value === "string";
      case "Number":
        return typeof value === "number" && Number.isFinite(value);
      case "Bool":
        return typeof value === "boolean";
      case "Array":
        return Array.isArray(value);
      case "Object":
        return !!value && typeof value === "object" && !Array.isArray(value);
      default:
        return false;
    }
  });
}
/** Structural/JSON decoding always applies; an empty schema is an explicit schema-free editor. */
export function validateEngineDocument(schema: Schema, value: unknown): boolean {
  const document: Document = decodeDocument(value);
  if (!Object.keys(schema.nodes).length && !Object.keys(schema.marks).length) return true;
  const valid = (block: Block, top: boolean): boolean => {
    const spec = schema.nodes[block.type];
    if (!spec || (top && !spec.top_level)) return false;
    if (!validAttributes(block.attrs, spec.attrs)) return false;
    if (
      spec.content === "RichText"
        ? block.content !== null && !Array.isArray(block.content)
        : spec.content === "RawText"
          ? block.content !== null && typeof block.content !== "string"
          : block.content !== null
    )
      return false;
    if (Array.isArray(block.content))
      for (const span of block.content)
        for (const mark of span.marks) {
          const definition = schema.marks[mark.type];
          if (
            !definition ||
            !validAttributes(mark.attrs, definition.attrs) ||
            spec.marks_allowed === "None" ||
            (typeof spec.marks_allowed === "object" && !spec.marks_allowed.Only.includes(mark.type))
          )
            return false;
        }
    if (block.children.length && (!spec.allows_children || spec.leaf)) return false;
    return block.children.every(
      (child) =>
        (!spec.child_types || spec.child_types.includes(child.type)) && valid(child, false),
    );
  };
  return document.blocks.every((block) => valid(block, true));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function findBlock(blocks: FallbackBlock[], id: unknown): FallbackBlock | undefined {
  for (const block of blocks) {
    if (block.id === id) return block;
    const nested = findBlock(block.children, id);
    if (nested) return nested;
  }
}

/** Validate against the staged state: earlier steps may insert or change the target block. */
export function validateEngineStep(
  schema: Schema,
  step: Record<string, unknown>,
  document: FallbackDoc,
): boolean {
  if (!Object.keys(schema.nodes).length && !Object.keys(schema.marks).length) return true;
  if (!step || typeof step !== "object") return false;
  if ("InsertBlock" in step) {
    const data = step.InsertBlock;
    return (
      isRecord(data) &&
      isRecord(data.block) &&
      typeof data.block.block_type === "string" &&
      !!schema.nodes[data.block.block_type]
    );
  }
  if ("SetBlockType" in step) {
    const data = step.SetBlockType;
    return isRecord(data) && typeof data.new_type === "string" && !!schema.nodes[data.new_type];
  }
  if (!("AddMark" in step) && !("InsertText" in step)) return true;
  const data = "AddMark" in step ? step.AddMark : step.InsertText;
  if (!isRecord(data)) return false;
  const marks = "AddMark" in step ? [data.mark] : data.marks;
  if (!Array.isArray(marks)) return false;
  const block = findBlock(document.blocks, data.block_id);
  const node = block && schema.nodes[block.block_type];
  if (!node) return false;
  return marks.every((mark: unknown) => {
    if (!isRecord(mark) || typeof mark.mark_type !== "string") return false;
    const attrs = mark.attrs === undefined ? {} : mark.attrs;
    if (!isRecord(attrs)) return false;
    const definition = schema.marks[mark.mark_type];
    return (
      !!definition &&
      node.marks_allowed !== "None" &&
      (typeof node.marks_allowed !== "object" ||
        node.marks_allowed.Only.includes(mark.mark_type)) &&
      validAttributes(cloneAttributes(attrs), definition.attrs)
    );
  });
}
