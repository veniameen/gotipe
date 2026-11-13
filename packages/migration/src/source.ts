import type { AttrValue } from "@gotipe/core";

/** A JSON object of the source document: a node, a mark or a set of fields. */
export type SourceNode = Record<string, AttrValue>;

export function object(value: AttrValue | undefined): value is SourceNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Bounds of migration input. A node is an object with a string `type` (a node or a mark) or a
 * Slate text leaf; the bounds admit a long book and still stop hostile input early.
 */
const LIMITS = {
  nodes: 1_000_000,
  /** Nodes inside nodes. */
  depth: 128,
  /** Arrays and objects inside each other: attribute objects and child lists included. */
  nesting: 512,
  /** Every value: strings, numbers, booleans, nulls, arrays and objects. */
  values: 16 * 1024 * 1024,
  /** UTF-16 code units of all string values together. */
  text: 32 * 1024 * 1024,
};

function isNode(value: object): boolean {
  return (
    ("type" in value && typeof value.type === "string") ||
    ("text" in value && typeof value.text === "string")
  );
}

/** Reject non-JSON inputs, cycles and oversized input before conversion can discard anything. */
export function readJSON(input: unknown): AttrValue {
  const active = new WeakSet<object>();
  let nodes = 0;
  let values = 0;
  let text = 0;
  function copy(value: unknown, depth: number, nesting: number): AttrValue {
    if (++values > LIMITS.values)
      throw new Error(`Migration input exceeds ${LIMITS.values} JSON values`);
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      text += value.length;
      if (text > LIMITS.text)
        throw new Error(`Migration input exceeds ${LIMITS.text} UTF-16 code units of text`);
      return value;
    }
    if (typeof value !== "object" || value === null || active.has(value)) {
      throw new Error("Migration input must be acyclic JSON");
    }
    if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      throw new Error("Migration input must contain only plain JSON objects");
    }
    if (nesting >= LIMITS.nesting)
      throw new Error(`Migration input nests JSON deeper than ${LIMITS.nesting} levels`);
    let level = depth;
    if (!Array.isArray(value) && isNode(value)) {
      if (++nodes > LIMITS.nodes) throw new Error(`Migration input exceeds ${LIMITS.nodes} nodes`);
      if (++level > LIMITS.depth)
        throw new Error(`Migration input nests nodes deeper than ${LIMITS.depth} levels`);
    }
    active.add(value);
    const result: AttrValue = Array.isArray(value)
      ? value.map((item) => copy(item, level, nesting + 1))
      : Object.fromEntries(
          Object.entries(value).map(([key, item]) => [key, copy(item, level, nesting + 1)]),
        );
    active.delete(value);
    return result;
  }
  return copy(input, 0, 0);
}

export function node(value: AttrValue, path: string): SourceNode {
  if (!object(value)) throw new Error(`${path}: expected a node object`);
  return value;
}

export function children(value: SourceNode, field: string, path: string): SourceNode[] {
  const items = value[field];
  if (items === undefined) return [];
  if (!Array.isArray(items)) throw new Error(`${path}.${field}: expected an array`);
  return items.map((item, index) => node(item, `${path}.${field}[${index}]`));
}

/** A copy of the node's `attrs` object (ProseMirror and Tiptap). */
export function attributes(value: SourceNode): SourceNode {
  if (value.attrs === undefined) return {};
  if (!object(value.attrs)) throw new Error("Node attrs must be an object");
  return { ...value.attrs };
}

/** The node's fields except the excluded ones. */
export function metadata(value: SourceNode, excluded: string[]): SourceNode {
  const omitted = new Set(excluded);
  return Object.fromEntries(Object.entries(value).filter(([key]) => !omitted.has(key)));
}

/** Moves `from` to `to` unless `to` is already set. */
export function rename(fields: SourceNode, from: string, to: string): void {
  const value = fields[from];
  if (value === undefined || fields[to] !== undefined) return;
  fields[to] = value;
  delete fields[from];
}

/** Removes fields that a converter has turned into something else. */
export function drop(fields: SourceNode, names: string[]): void {
  for (const name of names) delete fields[name];
}

/** Moves the listed fields that are present out of `fields` into `into`. */
export function take(fields: SourceNode, names: string[], into: SourceNode): void {
  for (const name of names) {
    const value = fields[name];
    if (value === undefined) continue;
    into[name] = value;
    delete fields[name];
  }
}
