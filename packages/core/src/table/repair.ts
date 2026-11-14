import type { Block } from "../types/block";
import type { Step } from "../types/state";
import { tableGrid } from "./grid";
import { planTable, planned } from "./layout";
import { tableSteps } from "./steps";

export interface TableRepairOptions {
  /** Fill the holes of short rows with empty cells (default true). */
  fill?: boolean;
  /** IDs of the cells a fill adds; random UUIDs by default. */
  createId?: () => string;
}

/** The table cannot be drawn as stored, or (with `fill`) leaves a position without a cell. */
function needsRepair(table: Block, fill: boolean): boolean {
  const grid = tableGrid(table);
  if (grid.problem) return true;
  if (!fill) return false;
  for (let row = 0; row < grid.rows; row++)
    for (let column = 0; column < grid.columns; column++) if (!grid.at(row, column)) return true;
  return false;
}

/**
 * The table with a valid grid: spans are whole numbers from 1 to 1000, a cell over rows stops at
 * the last row, a cell over columns stops before a position a cell from above covers, and (with
 * `fill`) every position has a cell. Cells keep their IDs, content and order. For tables built
 * outside the editor: HTML import, clipboard clipping.
 */
export function repairTable(table: Block, options: TableRepairOptions = {}): Block {
  const fill = options.fill ?? true;
  if (table.type !== "table" || !needsRepair(table, fill)) return table;
  return { ...table, children: planned(planTable(table, fill, options.createId)).children };
}

/**
 * The steps that turn every table of a document into a valid grid, as `repairTable` with `fill`;
 * none when every table is valid. Pure: collaboration runs it after a remote update, as
 * `normalizeRemoteAtoms`, so concurrent table edits never leave a table that cannot be edited.
 * Cells keep their IDs; a cell is added only where a position has none.
 */
export function normalizeTableGeometry(
  document: { blocks: Block[] },
  options: Pick<TableRepairOptions, "createId"> = {},
): Step[] {
  const steps: Step[] = [];
  const visit = (blocks: Block[]) => {
    for (const block of blocks) {
      if (block.type === "table") {
        if (needsRepair(block, true))
          steps.push(...tableSteps(block, planTable(block, true, options.createId)));
        continue;
      }
      visit(block.children);
    }
  };
  visit(document.blocks);
  return steps;
}
