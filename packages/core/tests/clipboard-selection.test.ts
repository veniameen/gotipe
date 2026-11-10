import { describe, expect, it } from "vitest";
import { documentTransaction } from "../src/clipboard/document";
import { copySelection, removeSelection } from "../src/clipboard/selection";
import { createEditor } from "../src/js";
import { blocksToText } from "../src/text";
import type { Block, Document } from "../src/types/block";
import type { SelectionView } from "../src/types/view";

const block = (
  id: string,
  text: string | null,
  children: Block[] = [],
  type = "paragraph",
): Block => ({
  id,
  type,
  attrs: {},
  content: text === null ? null : [{ text, marks: [] }],
  children,
});
const select = (a: string, start: number, b: string, end: number): SelectionView => ({
  type: "text",
  anchor: { blockId: a, offset: start },
  head: { blockId: b, offset: end },
});
const document = (...blocks: Block[]): Document => ({ version: 1, blocks });

describe("clipboard selection", () => {
  it("copies marked text inside a nested list item", () => {
    const row = block("row", "hello", [], "listItem");
    row.content = [{ text: "hello", marks: [{ type: "bold", attrs: {} }] }];
    const doc = document(block("list", null, [row], "bulletList"));
    expect(copySelection(doc, select("row", 1, "row", 4))).toEqual({
      spans: [{ text: "ell", marks: [{ type: "bold", attrs: {} }] }],
    });
  });

  it("normalizes reverse ranges and keeps nested containers", () => {
    const doc = document(
      block(
        "list",
        null,
        [block("a", "first", [], "listItem"), block("b", "second", [], "listItem")],
        "bulletList",
      ),
    );
    const payload = copySelection(doc, select("b", 3, "a", 2));
    expect(payload && "blocks" in payload && payload.blocks[0]!.type).toBe("bulletList");
    expect(payload && "blocks" in payload && blocksToText(payload.blocks)).toBe("rst\nsec");
    expect(blocksToText(doc.blocks)).toBe("first\nsecond");
  });

  it("cuts across paragraphs in one reversible transaction", async () => {
    const doc = document(
      block("a", "alpha"),
      block("middle", "remove"),
      block("b", "bravo"),
      block("keep", "untouched"),
    );
    const selection = select("b", 2, "a", 2);
    const plan = removeSelection(doc, selection)!;
    expect(blocksToText(plan.document.blocks)).toBe("alavo\nuntouched");
    const editor = await createEditor({ extensions: [], content: doc });
    editor.setSelection(selection);
    editor.dispatch(documentTransaction(doc, plan.document, plan.caret));
    expect(editor.getText()).toBe("alavo\nuntouched");
    expect(editor.undo()).toBe(true);
    expect(editor.getText()).toBe("alpha\nremove\nbravo\nuntouched");
    editor.destroy();
  });

  it("preserves unselected children when joining list rows", () => {
    const doc = document(
      block(
        "list",
        null,
        [
          block("a", "one", [], "listItem"),
          block(
            "b",
            "two",
            [block("sub", null, [block("child", "keep", [], "listItem")], "bulletList")],
            "listItem",
          ),
        ],
        "bulletList",
      ),
    );
    const plan = removeSelection(doc, select("a", 1, "b", 1))!;
    expect(blocksToText(plan.document.blocks)).toBe("owo\nkeep");
    expect(plan.document.blocks[0]!.children).toHaveLength(1);
    expect(plan.document.blocks[0]!.children[0]!.children[0]!.id).toBe("sub");
  });

  it("does not remove columns when cutting across table cells", () => {
    const doc = document(
      block(
        "table",
        null,
        [
          block(
            "row",
            null,
            [
              block("a", "abc", [], "tableCell"),
              block("b", "def", [], "tableCell"),
              block("c", "ghi", [], "tableCell"),
            ],
            "tableRow",
          ),
        ],
        "table",
      ),
    );
    const plan = removeSelection(doc, select("a", 1, "c", 2))!;
    expect(plan.document.blocks[0]!.children[0]!.children).toHaveLength(3);
    expect(blocksToText(plan.document.blocks)).toBe("a\t\ti");
  });

  it("rejects invalid UTF-16 boundaries without mutation", () => {
    const doc = document(block("a", "a😀b"));
    expect(copySelection(doc, select("a", 2, "a", 3))).toBeNull();
    expect(removeSelection(doc, select("a", 2, "a", 3))).toBeNull();
    expect(blocksToText(doc.blocks)).toBe("a😀b");
  });

  it("copies exact multi-block IDs without including unselected siblings", () => {
    const doc = document(
      block("a", "one"),
      block("b", "keep"),
      block("c", "three"),
      block("d", "after"),
    );
    const selection = { ...select("a", 0, "c", 0), type: "multi" as const, blockIds: ["a", "c"] };
    const payload = copySelection(doc, selection)!;
    expect("blocks" in payload && blocksToText(payload.blocks)).toBe("one\nthree");
    const result = removeSelection(doc, selection)!;
    expect(blocksToText(result.document.blocks)).toBe("keep\nafter");
    expect(result.caret).toEqual({ blockId: "b", offset: 0 });
  });

  it("keeps unrelated empty containers and rejects structural text endpoints", () => {
    const doc = document(
      block("empty", null, [], "bulletList"),
      block("a", "one"),
      block("b", "two"),
    );
    const result = removeSelection(doc, select("a", 1, "b", 1))!;
    expect(result.document.blocks[0]!.id).toBe("empty");
    expect(removeSelection(doc, select("empty", 0, "b", 1))).toBeNull();
  });
});
