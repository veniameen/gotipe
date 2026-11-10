import type { AttrValue, Block, Mark, TextSpan } from "@gotipe/core";
import type { MigrationOptions, MigrationResult } from "./types";

export type SourceNode = Record<string, AttrValue>;
export class UnsupportedContent extends Error {}

export function object(value: AttrValue | undefined): value is SourceNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reject non-JSON inputs and cycles before conversion can discard anything. */
export function readJSON(input: unknown): AttrValue {
  const active = new WeakSet<object>();
  let count = 0;
  let textSize = 0;
  function copy(value: unknown, depth: number): AttrValue {
    if (++count > 100_000 || depth > 128)
      throw new Error("Migration input exceeds structural limits");
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      textSize += value.length;
      if (textSize > 32 * 1024 * 1024) throw new Error("Migration input exceeds text limit");
      return value;
    }
    if (typeof value !== "object" || value === null || active.has(value)) {
      throw new Error("Migration input must be acyclic JSON");
    }
    if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      throw new Error("Migration input must contain only plain JSON objects");
    }
    active.add(value);
    const result: AttrValue = Array.isArray(value)
      ? value.map((item) => copy(item, depth + 1))
      : Object.fromEntries(
          Object.entries(value).map(([key, item]) => [key, copy(item, depth + 1)]),
        );
    active.delete(value);
    return result;
  }
  return copy(input, 0);
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
export function attributes(value: SourceNode): SourceNode {
  if (value.attrs === undefined) return {};
  if (!object(value.attrs)) throw new Error("Node attrs must be an object");
  return { ...value.attrs };
}
export function metadata(value: SourceNode, excluded: string[]): SourceNode {
  const omitted = new Set(excluded);
  return Object.fromEntries(Object.entries(value).filter(([key]) => !omitted.has(key)));
}
export function append(spans: TextSpan[], text: string, marks: Mark[] = []): void {
  const last = spans.at(-1);
  if (last && JSON.stringify(last.marks) === JSON.stringify(marks)) last.text += text;
  else spans.push({ text, marks });
}

export class MigrationContext {
  readonly warnings: string[] = [];
  private readonly ids = new Set<string>();
  constructor(
    readonly source: string,
    readonly options: MigrationOptions,
  ) {}

  warn(message: string): void {
    this.warnings.push(message);
    this.options.onWarning?.(message);
  }

  preserve(value: SourceNode, path: string, reason: string): Block {
    const reasonWithPath = `${this.source} ${path}: ${reason}`;
    if (this.options.strict) throw new UnsupportedContent(reasonWithPath);
    const message = `${reasonWithPath}; source preserved as markdownRaw`;
    this.warn(message);
    return this.block(
      "markdownRaw",
      { migrationSource: this.source, migrationType: String(value.type ?? "unknown") },
      JSON.stringify(value, null, 2),
      [],
    );
  }

  recover(value: SourceNode, path: string, convert: () => Block): Block {
    try {
      return convert();
    } catch (error) {
      if (error instanceof UnsupportedContent) return this.preserve(value, path, error.message);
      throw error;
    }
  }

  block(
    type: string,
    attrs: SourceNode,
    initialContent: TextSpan[] | string | null,
    descendants: Block[],
    requestedId?: AttrValue,
  ): Block {
    let content = initialContent;
    let id = typeof requestedId === "string" && requestedId.trim() !== "" ? requestedId : undefined;
    if (id && this.ids.has(id)) {
      this.warn(`Duplicate source ID ${id}; generated a replacement`);
      id = undefined;
    }
    id ??= this.options.createId?.() ?? crypto.randomUUID();
    if (typeof id !== "string" || id === "" || this.ids.has(id))
      throw new Error("Migration ID factory must return unique nonempty strings");
    this.ids.add(id);
    if (
      ["listItem", "todoItem", "blockquote", "tableCell", "tableHeader"].includes(type) &&
      Array.isArray(content) &&
      content.length === 0 &&
      descendants[0]?.type === "paragraph"
    ) {
      const paragraph = descendants.shift()!;
      content = paragraph.content;
      attrs.migrationFirstParagraph = { id: paragraph.id, attrs: paragraph.attrs };
    }
    if (type === "codeBlock") {
      if (descendants.length)
        throw new UnsupportedContent("Nested blocks inside code are unsupported");
      if (Array.isArray(content)) {
        if (content.some((span) => span.marks.length > 0))
          throw new UnsupportedContent("Formatted code cannot be represented as raw text");
        content = content.map((span) => span.text).join("");
      }
    } else if (
      ["bulletList", "orderedList", "todoList", "table", "tableRow", "image", "divider"].includes(
        type,
      )
    ) {
      if (Array.isArray(content) && content.some((span) => span.text !== ""))
        throw new UnsupportedContent("Text in a structural node cannot be represented");
      content = null;
    }
    return { id, type, attrs, content, children: descendants };
  }

  result(blocks: Block[], rootMetadata: SourceNode = {}): MigrationResult {
    if (Object.keys(rootMetadata).length) {
      if (!blocks.length) blocks.push(this.block("paragraph", {}, [], []));
      const first = blocks[0];
      if (first) first.attrs.migrationDocumentMetadata = rootMetadata;
    }
    function count(items: Block[]): number {
      return items.reduce(
        (total, block) => total + (block.attrs.migrationSource ? 1 : 0) + count(block.children),
        0,
      );
    }
    return {
      document: { blocks, version: 1 },
      warnings: this.warnings,
      skippedNodes: 0,
      preservedNodes: count(blocks),
    };
  }
}
