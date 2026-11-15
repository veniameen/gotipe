// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FullPreset } from "../src/presets";
import type { Block, Document } from "../src/types/block";
import type { GoTipeEditor } from "../src/types/editor";
import { ENGINES, createOn, doc, paragraph } from "./engines";

const ids = (editor: GoTipeEditor) => (editor.getJSON() as Document).blocks.map((item) => item.id);
const caret = (blockId: string, offset: number) => ({
  type: "text",
  anchor: { blockId, offset },
  head: { blockId, offset },
});
function selection(editor: GoTipeEditor) {
  const { type, anchor, head } = editor.getViewState().selection;
  return { type, anchor, head };
}

describe.each(ENGINES)(
  "%s chain: the staged selection after the chain's own steps (D-07)",
  (engine) => {
    const create = (...blocks: Block[]) =>
      createOn(engine, { extensions: FullPreset, content: doc(...blocks) });

    it("selectAll().deleteBlock() removes the first block and keeps the rest selected", async () => {
      const editor = await create(
        paragraph("a", "один"),
        paragraph("b", "два 😀"),
        paragraph("c", "три"),
      );
      try {
        expect(editor.chain().selectAll().deleteBlock().run()).toBe(true);
        expect(ids(editor)).toEqual(["b", "c"]);
        expect(selection(editor)).toEqual({
          type: "text",
          anchor: { blockId: "b", offset: 0 },
          head: { blockId: "c", offset: 3 },
        });
        expect(editor.undo()).toBe(true);
        expect(ids(editor)).toEqual(["a", "b", "c"]);
      } finally {
        editor.destroy();
      }
    });

    it("a caret staged in a block merged into the previous one stays by the same text", async () => {
      const editor = await create(paragraph("a", "один"), paragraph("b", "два"));
      try {
        const run = editor
          .chain()
          .setSelection({ type: "cursor", blockId: "b", offset: 1 })
          .mergeWithPrevious()
          .run();
        expect(run).toBe(true);
        expect(ids(editor)).toEqual(["a"]);
        expect(editor.getText()).toBe("одиндва");
        expect(selection(editor)).toEqual(caret("a", 5));
      } finally {
        editor.destroy();
      }
    });

    it("a caret staged in a deleted block goes to the next block, or to the end of the previous", async () => {
      const middle = await create(
        paragraph("a", "один"),
        paragraph("b", "два"),
        paragraph("c", "три"),
      );
      const last = await create(paragraph("a", "один"), paragraph("b", "два"));
      try {
        const staged = { type: "cursor", blockId: "b", offset: 2 } as const;
        expect(middle.chain().setSelection(staged).deleteBlock().run()).toBe(true);
        expect(ids(middle)).toEqual(["a", "c"]);
        expect(selection(middle)).toEqual(caret("c", 0));
        expect(last.chain().setSelection(staged).deleteBlock().run()).toBe(true);
        expect(ids(last)).toEqual(["a"]);
        expect(selection(last)).toEqual(caret("a", 4));
      } finally {
        middle.destroy();
        last.destroy();
      }
    });

    it("a selected block that the chain deletes leaves a caret at the next block", async () => {
      const editor = await create(
        paragraph("a", "один"),
        paragraph("b", "два"),
        paragraph("c", "три"),
      );
      try {
        expect(editor.chain().selectBlock("b").deleteBlock().run()).toBe(true);
        expect(ids(editor)).toEqual(["a", "c"]);
        expect(selection(editor)).toEqual(caret("c", 0));
      } finally {
        editor.destroy();
      }
    });

    it("keeps a staged selection that still fits the result", async () => {
      const editor = await create(paragraph("a", "один"), paragraph("b", "два"));
      try {
        const run = editor
          .chain()
          .setSelection({ type: "text", blockId: "b", from: 1, to: 3 })
          .setBlockType("heading", { level: 2 })
          .run();
        expect(run).toBe(true);
        expect(selection(editor)).toEqual({
          type: "text",
          anchor: { blockId: "b", offset: 1 },
          head: { blockId: "b", offset: 3 },
        });
      } finally {
        editor.destroy();
      }
    });
  },
);
