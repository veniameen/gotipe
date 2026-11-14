import { normalizeTableGeometry } from "../table/repair";
import type { Block, Document } from "../types/block";
import type { Step } from "../types/state";

/**
 * The repair of tables a remote update left without a valid grid (concurrent merges, row and
 * column edits), as steps for a local transaction. Runs only when a table changed. A cell the
 * repair adds is named after its place, the row and its index there, so replicas that repair the
 * same table the same way create the same block instead of two.
 */
export function remoteTableRepair(before: Document, after: Document): Step[] {
  if (!tablesChanged(before.blocks, after.blocks)) return [];
  const placeholders: string[] = [];
  const steps = normalizeTableGeometry(after, {
    createId: () => {
      const id = `⦃repair:${placeholders.length}⦄`;
      placeholders.push(id);
      return id;
    },
  });
  if (!placeholders.length) return steps;
  const taken = new Set<string>();
  collect(after.blocks, (block) => taken.add(block.id));
  let json = JSON.stringify(steps);
  for (const step of steps) {
    if (step.type !== "insertBlock" || !placeholders.includes(step.block.id)) continue;
    const place = `${step.parentId ?? ""}/${step.index}`;
    let id = `cell-${hash(place)}`;
    for (let n = 1; taken.has(id); n++) id = `cell-${hash(`${place}/${n}`)}`;
    taken.add(id);
    json = json.replaceAll(JSON.stringify(step.block.id), JSON.stringify(id));
  }
  return JSON.parse(json) as Step[];
}

/** Whether any table differs between the documents, nested tables included. */
function tablesChanged(before: Block[], after: Block[]): boolean {
  const tables = (blocks: Block[]) => {
    const found = new Map<string, string>();
    collect(blocks, (block) => {
      if (block.type === "table") found.set(block.id, JSON.stringify(block));
    });
    return found;
  };
  const old = tables(before);
  for (const [id, table] of tables(after)) if (old.get(id) !== table) return true;
  return false;
}
function collect(blocks: Block[], visit: (block: Block) => void): void {
  for (const block of blocks) {
    visit(block);
    collect(block.children, visit);
  }
}
/** 64 bits of FNV-1a as hex: stable on every replica, unlike a random UUID. */
function hash(text: string): string {
  let low = 0x811c9dc5;
  let high = 0xcbf29ce4;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    low = Math.imul(low ^ code, 0x01000193) >>> 0;
    high = Math.imul(high ^ code ^ (low >>> 13), 0x01000193) >>> 0;
  }
  return high.toString(16).padStart(8, "0") + low.toString(16).padStart(8, "0");
}
