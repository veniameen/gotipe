import type { Block, Document } from "@gotipe/core";
import type { VersionDiff } from "./types";

/** Canonical key ordering avoids reporting property insertion order as an edit. */
export function snapshotKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(snapshotKey).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${snapshotKey(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

interface Entry {
  block: Block;
  parentId: string | null;
  index: number;
}
function collect(blocks: Block[], parentId: string | null = null, out = new Map<string, Entry>()) {
  blocks.forEach((block, index) => {
    out.set(block.id, { block, parentId, index });
    collect(block.children, block.id, out);
  });
  return out;
}
/** Compares every block's own data and position; child edits are not duplicated on ancestors. */
export function compareDocuments(a: Document, b: Document): VersionDiff {
  const before = collect(a.blocks);
  const after = collect(b.blocks);
  const result: VersionDiff = { added: [], removed: [], modified: [], moved: [] };
  for (const id of before.keys()) if (!after.has(id)) result.removed.push(id);
  for (const [id, next] of after) {
    const previous = before.get(id);
    if (!previous) {
      result.added.push(id);
      continue;
    }
    const own = (block: Block) => ({
      type: block.type,
      attrs: block.attrs,
      content: block.content,
    });
    if (snapshotKey(own(previous.block)) !== snapshotKey(own(next.block))) result.modified.push(id);
    if (previous.parentId !== next.parentId || previous.index !== next.index) result.moved.push(id);
  }
  return result;
}
