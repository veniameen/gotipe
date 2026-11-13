import type { AttrValue, Block } from "@gotipe/core";
import type { PreservedSource, UnmappedSource } from "./types";

/** A block as the report sees it; a block that became its container's text points `into` it. */
export interface BlockRef {
  readonly id: string;
  into?: BlockRef;
}

/** Whether an unmapped source value is a default that needs no warning (it is still reported). */
export type Quiet = (sourceType: string, field: string, value: AttrValue) => boolean;

interface Entry {
  ref: BlockRef | null;
  order: number;
  path: string;
  sourceType: string;
  fields: Record<string, AttrValue>;
  /** Source type of the container whose text the block became, for a flattened block. */
  into?: string;
}

export type ReportMark = readonly [warnings: number, preserved: number, entries: number];

function blockId(ref: BlockRef | null): string | null {
  let target = ref;
  while (target?.into) target = target.into;
  return target ? target.id : null;
}

/** A converted block as a JSON value, for the report. */
export function blockJSON(block: Block): AttrValue {
  return {
    id: block.id,
    type: block.type,
    attrs: block.attrs,
    content: Array.isArray(block.content)
      ? block.content.map((span) => ({
          text: span.text,
          marks: span.marks.map((mark) => ({ type: mark.type, attrs: mark.attrs })),
        }))
      : block.content,
    children: block.children.map(blockJSON),
  };
}

/** One warning for every occurrence of the same kind, naming the first path and the count. */
class Summary {
  private readonly seen = new Map<
    string,
    { message: (path: string) => string; path: string; count: number }
  >();

  add(key: string, path: string, message: (path: string) => string): void {
    const seen = this.seen.get(key);
    if (seen) seen.count++;
    else this.seen.set(key, { message, path, count: 1 });
  }

  messages(): string[] {
    return [...this.seen.values()].map(
      ({ message, path, count }) => `${message(path)}${count > 1 ? ` (${count} times)` : ""}`,
    );
  }
}

/**
 * Warnings, preserved subtrees and source fields that are not in the document. A failed
 * conversion of a subtree is undone with `restore`, so nothing stale reaches the result.
 */
export class MigrationReport {
  private readonly warnings: string[] = [];
  private readonly preserved: PreservedSource[] = [];
  private readonly entries: Entry[] = [];

  warn(message: string): void {
    this.warnings.push(message);
  }

  preserve(entry: PreservedSource): void {
    this.preserved.push(entry);
  }

  /** Records fields of a source object; `order` is the node's position in the source. */
  unmapped(
    ref: BlockRef | null,
    order: number,
    path: string,
    sourceType: string,
    fields: Record<string, AttrValue>,
  ): void {
    // null marks an unset field in all three source formats: there is nothing to keep.
    const set = Object.entries(fields).filter(([, value]) => value !== null);
    if (set.length)
      this.entries.push({ ref, order, path, sourceType, fields: Object.fromEntries(set) });
  }

  /** Records a block that became lines of its container's text, as `{ block }`. */
  flattened(
    ref: BlockRef,
    order: number,
    path: string,
    sourceType: string,
    into: string,
    fields: { block: AttrValue },
  ): void {
    this.entries.push({ ref, order, path, sourceType, fields, into });
  }

  mark(): ReportMark {
    return [this.warnings.length, this.preserved.length, this.entries.length];
  }

  restore([warnings, preserved, entries]: ReportMark): void {
    this.warnings.length = warnings;
    this.preserved.length = preserved;
    this.entries.length = entries;
  }

  /** The report in source order; one warning per kind of field or flattened block. */
  finish(source: string, quiet: Quiet = () => false) {
    const sorted = [...this.entries].sort((a, b) => a.order - b.order);
    const summary = new Summary();
    for (const { path, sourceType, fields, into } of sorted) {
      if (into !== undefined) {
        summary.add(JSON.stringify(["block", into, sourceType]), path, (at) => {
          return `${source} ${at}: ${sourceType} in ${into} became lines of its text; kept in unmapped`;
        });
        continue;
      }
      for (const [field, value] of Object.entries(fields)) {
        // A string ID that cannot stay a block ID has its own warning or is expected.
        if (field === "id" && typeof value === "string" && value.trim() !== "") continue;
        if (quiet(sourceType, field, value)) continue;
        summary.add(JSON.stringify(["field", sourceType, field]), path, (at) => {
          return `${source} ${at}: ${sourceType} field ${field} does not fit the GoTipe schema; kept in unmapped`;
        });
      }
    }
    const unmapped: UnmappedSource[] = sorted.map((entry) => ({
      blockId: blockId(entry.ref),
      path: entry.path,
      sourceType: entry.sourceType,
      fields: entry.fields,
    }));
    return {
      warnings: [...this.warnings, ...summary.messages()],
      preserved: [...this.preserved],
      unmapped,
    };
  }
}
