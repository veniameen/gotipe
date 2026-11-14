import type { AttrValue, Block } from "../types/block";
import type { Step } from "../types/state";
import { type PlannedTable, planned } from "./layout";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const length = (block: Block) =>
  Array.isArray(block.content) ? block.content.reduce((sum, span) => sum + span.text.length, 0) : 0;

/**
 * The steps that turn the stored table into the planned one. Cells keep their IDs: a cell that
 * only changes its span is updated, one whose top row goes away moves to the next row, so
 * comments, history and other replicas keep pointing at it.
 */
export function tableSteps(table: Block, plan: PlannedTable): Step[] {
  if (plan.removed) return [{ type: "deleteBlock", blockId: table.id }];
  const target = planned(plan);
  const steps: Step[] = [];
  const kept = new Set(target.children.flatMap((row) => row.children.map((cell) => cell.id)));
  const rows = new Map(table.children.map((row) => [row.id, row.children.map((cell) => cell.id)]));
  const order = table.children.map((row) => row.id);
  const owner = new Map<string, string>();
  for (const row of table.children) for (const cell of row.children) owner.set(cell.id, row.id);

  // 1. cells that go away
  for (const row of table.children)
    for (const cell of row.children)
      if (!kept.has(cell.id)) {
        steps.push({ type: "deleteBlock", blockId: cell.id });
        rows.get(row.id)!.splice(rows.get(row.id)!.indexOf(cell.id), 1);
      }
  // 2. new rows, empty, after the row that precedes them in the plan
  let previous: string | null = null;
  for (const row of target.children) {
    if (!rows.has(row.id)) {
      const index = previous === null ? 0 : order.indexOf(previous) + 1;
      steps.push({
        type: "insertBlock",
        parentId: table.id,
        index,
        block: { ...row, children: [] },
      });
      order.splice(index, 0, row.id);
      rows.set(row.id, []);
    }
    previous = row.id;
  }
  // 3. every row gets its cells in order: new cells inserted, kept cells moved in
  for (const row of target.children) {
    const current = rows.get(row.id)!;
    row.children.forEach((cell, index) => {
      if (current[index] === cell.id) return;
      const from = owner.get(cell.id);
      if (from === undefined) {
        steps.push({
          type: "insertBlock",
          parentId: row.id,
          index,
          block: { ...cell, content: Array.isArray(cell.content) ? [] : cell.content },
        });
        owner.set(cell.id, row.id);
      } else {
        const source = rows.get(from)!;
        source.splice(source.indexOf(cell.id), 1);
        steps.push({ type: "moveBlock", blockId: cell.id, newParentId: row.id, newIndex: index });
        owner.set(cell.id, row.id);
      }
      current.splice(index, 0, cell.id);
    });
  }
  // 4. spans, then the text merged cells bring along
  const before = new Map(
    table.children.flatMap((row) => row.children.map((cell) => [cell.id, cell] as const)),
  );
  for (const row of target.children)
    for (const cell of row.children) {
      const old = before.get(cell.id);
      const changed: Record<string, AttrValue> = {};
      for (const name of ["colspan", "rowspan"])
        if (cell.attrs[name] !== undefined && !same(cell.attrs[name], old?.attrs[name]))
          changed[name] = cell.attrs[name]!;
      if (old && Object.keys(changed).length)
        steps.push({ type: "setBlockAttrs", blockId: cell.id, attrs: changed });
    }
  for (const cell of plan.cells) {
    let offset = cell.fresh ? 0 : length(cell.block);
    for (const line of cell.appended) {
      for (const span of offset > 0 ? [{ text: "\n", marks: [] }, ...line] : line) {
        if (!span.text) continue;
        steps.push({
          type: "insertText",
          blockId: cell.block.id,
          offset,
          text: span.text,
          marks: span.marks,
        });
        offset += span.text.length;
      }
    }
  }
  // 5. rows left without a place, then the columns' widths and alignment
  for (const id of order)
    if (!target.children.some((row) => row.id === id))
      steps.push({ type: "deleteBlock", blockId: id });
  const widths = Array.isArray(table.attrs.colWidths) ? table.attrs.colWidths : undefined;
  const align = Array.isArray(table.attrs.align) ? table.attrs.align : undefined;
  const attrs: Record<string, AttrValue> = {};
  if (widths ? !same(widths, plan.widths) : !plan.widths.every((width) => width === 160))
    attrs.colWidths = plan.widths;
  if (align ? !same(align, plan.align) : plan.align.some((value) => value !== null))
    attrs.align = plan.align;
  if (Object.keys(attrs).length) steps.push({ type: "setBlockAttrs", blockId: table.id, attrs });
  return steps;
}
