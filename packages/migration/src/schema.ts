import type { AttrSpec, AttrValue, MarkSpec, NodeSpec } from "@gotipe/core";
import * as extensions from "@gotipe/core/extensions";
import { hasLines } from "./text";

/** Block type of a source subtree kept as JSON; `@gotipe/markdown` declares it, not core. */
export const RAW = "markdownRaw";

/**
 * Containers whose first paragraph becomes their own text. One without children (a table cell)
 * writes all its paragraphs, headings and lists as lines of its text.
 */
const TEXT_CONTAINERS = new Set([
  "listItem",
  "todoItem",
  "blockquote",
  "callout",
  "tableCell",
  "tableHeader",
]);

/** A list item found outside a list gets a new list of this type around it. */
export const ITEM_LISTS: Readonly<Record<string, string>> = {
  listItem: "bulletList",
  todoItem: "todoList",
};

interface Specs {
  nodes: Map<string, NodeSpec>;
  marks: Map<string, MarkSpec>;
}
let stock: Specs | undefined;

/** The node and mark specs of GoTipe's own extensions, collected on first use. */
function specs(): Specs {
  if (stock) return stock;
  const nodes = new Map<string, NodeSpec>();
  const marks = new Map<string, MarkSpec>();
  for (const extension of Object.values(extensions)) {
    for (const spec of extension.nodes ?? []) nodes.set(spec.name, spec);
    for (const spec of extension.marks ?? []) marks.set(spec.name, spec);
  }
  stock = { nodes, marks };
  return stock;
}

/** The GoTipe spec of a block type; `undefined` for a type an application defines itself. */
export function nodeSpec(type: string): NodeSpec | undefined {
  return specs().nodes.get(type);
}

export function markSpec(type: string): MarkSpec | undefined {
  return specs().marks.get(type);
}

export function isTextContainer(type: string): boolean {
  return TEXT_CONTAINERS.has(type);
}

/** Whether the GoTipe schema lets `child` sit under `parent`; `null` is the top level. */
export function holds(parent: string | null, child: string): boolean {
  if (parent === null) return nodeSpec(child)?.topLevel ?? true;
  const container = nodeSpec(parent);
  if (!container) return true;
  if (!container.allowsChildren || container.leaf) return false;
  return !container.childTypes || container.childTypes.includes(child);
}

/** Whether a text container takes `child` into its own text instead of holding it. */
export function takesAsText(parent: string | null, child: string): boolean {
  if (parent === null || !TEXT_CONTAINERS.has(parent)) return false;
  if (child === "paragraph") return true;
  const spec = nodeSpec(parent);
  return spec !== undefined && !(spec.allowsChildren && !spec.leaf) && hasLines(child);
}

/** Whether a converted `child` can be placed under `parent`, after absorbing or wrapping. */
export function accepts(parent: string | null, child: string): boolean {
  if (holds(parent, child) || takesAsText(parent, child)) return true;
  const list = ITEM_LISTS[child];
  return list !== undefined && holds(parent, list);
}

/** Whether a node of this type can have block children (or absorbs paragraphs). */
export function holdsBlocks(type: string): boolean {
  const spec = nodeSpec(type);
  return !spec || TEXT_CONTAINERS.has(type) || (spec.allowsChildren && !spec.leaf);
}

function matches(spec: AttrSpec, value: AttrValue): boolean {
  switch (spec.type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "bool":
      return typeof value === "boolean";
    case "enum":
      return typeof value === "string" && (spec.values ?? []).some((allowed) => allowed === value);
    case "array":
      return Array.isArray(value);
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    default:
      return false;
  }
}

/**
 * Splits values into the attributes a spec declares with a value of the declared kind and the
 * rest. `null` marks an unset source attribute, so it is never kept.
 */
export function fitAttributes(
  declared: Record<string, AttrSpec>,
  values: Record<string, AttrValue>,
): { kept: Record<string, AttrValue>; rest: Record<string, AttrValue>; missing?: string } {
  const kept: Record<string, AttrValue> = {};
  const rest: Record<string, AttrValue> = {};
  for (const [name, value] of Object.entries(values)) {
    const spec = declared[name];
    if (value !== null && spec && matches(spec, value)) kept[name] = value;
    else rest[name] = value;
  }
  const missing = Object.entries(declared).find(([name, spec]) => spec.required && !(name in kept));
  return missing ? { kept, rest, missing: missing[0] } : { kept, rest };
}
