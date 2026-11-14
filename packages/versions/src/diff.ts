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
/** The ids of `before` that keep their order in `after`: one longest common subsequence. */
function stableOrder(before: string[], after: string[]): Set<string> {
  const rows = before.length;
  const cols = after.length;
  // lengths[i][j]: the longest common subsequence of before[i..] and after[j..]
  const lengths = Array.from({ length: rows + 1 }, () => new Uint32Array(cols + 1));
  for (let i = rows - 1; i >= 0; i--)
    for (let j = cols - 1; j >= 0; j--)
      lengths[i]![j] =
        before[i] === after[j]
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
  const kept = new Set<string>();
  for (let i = 0, j = 0; i < rows && j < cols; ) {
    if (before[i] === after[j]) {
      kept.add(before[i]!);
      i++;
      j++;
    } else if (lengths[i + 1]![j]! > lengths[i]![j + 1]!) i++;
    else j++;
  }
  return kept;
}

/** Siblings, by parent, in document order. */
function siblings(entries: Map<string, Entry>): Map<string | null, string[]> {
  const out = new Map<string | null, string[]>();
  for (const [id, entry] of entries) {
    const list = out.get(entry.parentId) ?? [];
    list[entry.index] = id;
    out.set(entry.parentId, list);
  }
  return out;
}

/**
 * Compares every block's own data and position; child edits are not duplicated on ancestors.
 * A block counts as moved when its parent changed or when it changed its order among the
 * siblings both versions share: inserting or removing a sibling moves nothing (D-45).
 */
export function compareDocuments(a: Document, b: Document): VersionDiff {
  const before = collect(a.blocks);
  const after = collect(b.blocks);
  const result: VersionDiff = { added: [], removed: [], modified: [], moved: [] };
  for (const id of before.keys()) if (!after.has(id)) result.removed.push(id);
  const stay = (id: string) => before.get(id)?.parentId === after.get(id)?.parentId;
  const beforeSiblings = siblings(before);
  const kept = new Set<string>();
  for (const [parent, ids] of siblings(after)) {
    const shared = ids.filter((id) => before.has(id) && stay(id));
    const previous = (beforeSiblings.get(parent) ?? []).filter((id) => after.has(id) && stay(id));
    for (const id of stableOrder(previous, shared)) kept.add(id);
  }
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
    if (previous.parentId !== next.parentId || !kept.has(id)) result.moved.push(id);
  }
  return result;
}
