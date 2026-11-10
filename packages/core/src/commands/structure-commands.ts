import { GoTipeError } from "../error";
import { insertionPoint } from "./insertion-point";
import type { CommandPort } from "./port";

/** Constructors for compound document blocks. */
export class StructureCommands {
  constructor(private port: CommandPort) {}
  // Table
  insertTable(options: { rows: number; cols: number; withHeader?: boolean }): this {
    if (
      !Number.isInteger(options.rows) ||
      !Number.isInteger(options.cols) ||
      options.rows < 1 ||
      options.cols < 1 ||
      options.rows * options.cols > 5000
    ) {
      throw new GoTipeError(
        "TRANSFORM_ERROR",
        "A table needs positive integer dimensions and at most 5000 cells",
      );
    }
    const state = this.port.getState();
    const blockId = state.selection.anchor.blockId;
    const location = insertionPoint(state.blocks, blockId, "table", "after", this.port.allowsChild);
    const rows: import("../types/block").Block[] = [];

    for (let r = 0; r < options.rows; r++) {
      const cells: import("../types/block").Block[] = [];
      for (let c = 0; c < options.cols; c++) {
        cells.push({
          id: crypto.randomUUID(),
          type: r === 0 && options.withHeader ? "tableHeader" : "tableCell",
          attrs: {},
          content: [],
          children: [],
        });
      }
      rows.push({
        id: crypto.randomUUID(),
        type: "tableRow",
        attrs: {},
        content: null,
        children: cells,
      });
    }

    this.port.append({
      type: "insertBlock",
      ...location,
      block: {
        id: crypto.randomUUID(),
        type: "table",
        attrs: {},
        content: null,
        children: rows,
      },
    });
    return this;
  }

  insertColumns(count = 2): this {
    if (!Number.isInteger(count) || count < 1 || count > 12) {
      throw new GoTipeError("TRANSFORM_ERROR", "A columns block needs between 1 and 12 columns");
    }
    const state = this.port.getState();
    const blockId = state.selection.anchor.blockId;
    const location = insertionPoint(
      state.blocks,
      blockId,
      "columns",
      "after",
      this.port.allowsChild,
    );

    const columns: import("../types/block").Block[] = [];
    for (let i = 0; i < count; i++) {
      columns.push({
        id: crypto.randomUUID(),
        type: "column",
        attrs: {},
        content: null,
        children: [
          {
            id: crypto.randomUUID(),
            type: "paragraph",
            attrs: {},
            content: [],
            children: [],
          },
        ],
      });
    }

    this.port.append({
      type: "insertBlock",
      ...location,
      block: {
        id: crypto.randomUUID(),
        type: "columns",
        attrs: { count },
        content: null,
        children: columns,
      },
    });
    return this;
  }

  insertToggle(): this {
    const state = this.port.getState();
    const blockId = state.selection.anchor.blockId;
    const location = insertionPoint(
      state.blocks,
      blockId,
      "toggle",
      "after",
      this.port.allowsChild,
    );

    this.port.append({
      type: "insertBlock",
      ...location,
      block: {
        id: crypto.randomUUID(),
        type: "toggle",
        attrs: { open: true },
        content: [{ text: "Toggle heading", marks: [] }],
        children: [
          {
            id: crypto.randomUUID(),
            type: "paragraph",
            attrs: {},
            content: [],
            children: [],
          },
        ],
      },
    });
    return this;
  }
}
