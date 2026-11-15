import { describe, expect, it } from "vitest";
import { WasmBridge } from "../src/wasm-bridge";

interface Block {
  id: string;
  block_type: string;
  attrs: Record<string, unknown>;
  content:
    | { type: "Raw"; value: string }
    | {
        type: "RichText";
        value: { text: string; marks: { mark_type: string; attrs: object }[] }[];
      };
  children: Block[];
}

function raw(id: string, text: string): Block {
  return {
    id,
    block_type: "codeBlock",
    attrs: { language: "typescript" },
    content: { type: "Raw", value: text },
    children: [],
  };
}

function rich(id: string, text: string, children: Block[] = []): Block {
  return {
    id,
    block_type: "paragraph",
    attrs: {},
    content: { type: "RichText", value: [{ text, marks: [] }] },
    children,
  };
}

async function createBridge(blocks: Block[]) {
  const bridge = new WasmBridge(null, "js");
  await bridge.init();
  bridge.create(JSON.stringify({ nodes: {}, marks: {} }), JSON.stringify({ version: 1, blocks }));
  return bridge;
}

function apply(bridge: WasmBridge, ...steps: object[]): { blocks: Block[] } {
  return JSON.parse(bridge.apply(JSON.stringify({ steps })));
}

describe("JS bridge document integrity", () => {
  it("rejects colliding subtree IDs without applying earlier transaction steps", async () => {
    const bridge = await createBridge([rich("a", "before", [rich("nested", "child")])]);
    const before = bridge.getState();
    expect(() =>
      apply(
        bridge,
        { InsertText: { block_id: "a", offset: 6, text: "!", marks: [] } },
        {
          InsertBlock: {
            parent_id: null,
            index: 1,
            block: rich("new", "", [rich("nested", "collision")]),
          },
        },
      ),
    ).toThrow("Duplicate");
    expect(bridge.getState()).toBe(before);
    expect(() =>
      apply(bridge, {
        InsertBlock: {
          parent_id: null,
          index: 1,
          block: rich("root", "", [rich("same", "one"), rich("same", "two")]),
        },
      }),
    ).toThrow("Duplicate");
    expect(bridge.getState()).toBe(before);
  });

  it("inserts into Raw code without replacing its existing text or content type", async () => {
    const bridge = await createBridge([raw("code", "абв")]);
    const doc = apply(bridge, {
      InsertText: { block_id: "code", offset: 1, text: "X", marks: [] },
    });
    expect(doc.blocks[0]).toEqual(raw("code", "аXбв"));
  });

  it.each(["DeleteText", "DeleteRange"])("%s removes only the selected Raw range", async (tag) => {
    const bridge = await createBridge([raw("code", "a😀b")]);
    const doc = apply(bridge, { [tag]: { block_id: "code", from: 1, to: 3 } });
    expect(doc.blocks[0]).toEqual(raw("code", "ab"));
  });

  it("splits Raw content into two code blocks with intact attributes", async () => {
    const bridge = await createBridge([raw("code", "first\nsecond")]);
    const doc = apply(bridge, { SplitBlock: { block_id: "code", offset: 6 } });
    expect(doc.blocks).toHaveLength(2);
    expect(doc.blocks[0]).toEqual(raw("code", "first\n"));
    expect(doc.blocks[1]).toEqual(raw(doc.blocks[1]!.id, "second"));
    expect(doc.blocks[1]!.id).not.toBe("code");
  });

  it("merges Raw content without converting it to empty rich text", async () => {
    const bridge = await createBridge([raw("a", "first\n"), raw("b", "second")]);
    const doc = apply(bridge, { MergeBlocks: { block_id: "b", target_id: "a" } });
    expect(doc.blocks).toEqual([raw("a", "first\nsecond")]);
  });

  // One contract with the Rust engine (D-03): a mark step needs rich text, raw text stays as is.
  it.each(["AddMark", "RemoveMark"])("%s rejects non-rich content untouched", async (tag) => {
    const bridge = await createBridge([raw("code", "const x = 1;")]);
    const before = bridge.getState();
    expect(() =>
      apply(bridge, {
        [tag]: {
          block_id: "code",
          from: 0,
          to: 5,
          mark: { mark_type: "bold", attrs: {} },
          mark_type: "bold",
        },
      }),
    ).toThrow("Invalid content type for this operation");
    expect(bridge.getState()).toBe(before);
  });

  it("keeps child blocks and rich-text marks when merging siblings", async () => {
    const a = rich("a", "first", [rich("child-a", "A")]);
    const b = rich("b", "second", [rich("child-b", "B")]);
    if (b.content.type === "RichText")
      b.content.value[0]!.marks = [{ mark_type: "bold", attrs: {} }];
    const bridge = await createBridge([a, b]);
    const doc = apply(bridge, { MergeBlocks: { block_id: "b", target_id: "a" } });
    expect(doc.blocks).toHaveLength(1);
    expect(doc.blocks[0]!.content).toEqual({
      type: "RichText",
      value: [
        { text: "first", marks: [] },
        { text: "second", marks: [{ mark_type: "bold", attrs: {} }] },
      ],
    });
    expect(doc.blocks[0]!.children.map((block) => block.id)).toEqual(["child-a", "child-b"]);
  });

  it.each(["missing", "source", "child"])(
    "rejects move into %s without losing the source subtree",
    async (parentId) => {
      const bridge = await createBridge([
        rich("source", "parent", [rich("child", "nested")]),
        rich("other", "keep"),
      ]);
      const before = bridge.getState();
      expect(() =>
        apply(bridge, { MoveBlock: { block_id: "source", new_parent_id: parentId, new_index: 0 } }),
      ).toThrow();
      expect(bridge.getState()).toBe(before);
    },
  );

  it("keeps valid same-parent and cross-parent moves working", async () => {
    const bridge = await createBridge([rich("a", "A"), rich("b", "B"), rich("parent", "P")]);
    let doc = apply(bridge, { MoveBlock: { block_id: "a", new_parent_id: null, new_index: 1 } });
    expect(doc.blocks.map((block) => block.id)).toEqual(["b", "a", "parent"]);
    doc = apply(bridge, { MoveBlock: { block_id: "a", new_parent_id: "parent", new_index: 0 } });
    expect(doc.blocks.map((block) => block.id)).toEqual(["b", "parent"]);
    expect(doc.blocks[1]!.children.map((block) => block.id)).toEqual(["a"]);
  });

  it.each(["self", "ancestor", "descendant", "mixed"])(
    "rejects %s merge without changing either block",
    async (kind) => {
      const bridge = await createBridge([
        rich("parent", "parent", [rich("child", "child")]),
        raw("code", "code"),
      ]);
      const source = kind === "descendant" ? "parent" : kind === "mixed" ? "code" : "child";
      const target = kind === "ancestor" || kind === "mixed" ? "parent" : "child";
      const before = bridge.getState();
      expect(() =>
        apply(bridge, { MergeBlocks: { block_id: source, target_id: target } }),
      ).toThrow();
      expect(bridge.getState()).toBe(before);
    },
  );

  it("rolls back earlier steps when a later structural step is invalid", async () => {
    const bridge = await createBridge([raw("code", "keep")]);
    const before = bridge.getState();
    expect(() =>
      apply(
        bridge,
        { InsertText: { block_id: "code", offset: 4, text: "!", marks: [] } },
        { MoveBlock: { block_id: "code", new_parent_id: "missing", new_index: 0 } },
      ),
    ).toThrow();
    expect(bridge.getState()).toBe(before);
  });

  it("does not silently commit a transaction containing an unsupported step", async () => {
    const bridge = await createBridge([rich("a", "keep")]);
    const before = bridge.getState();
    expect(() =>
      apply(
        bridge,
        { InsertText: { block_id: "a", offset: 4, text: "!", marks: [] } },
        { UnknownOperation: {} },
      ),
    ).toThrow();
    expect(bridge.getState()).toBe(before);
  });

  it.each([
    { DeleteText: { block_id: "a", from: 3, to: 1 } },
    { InsertText: { block_id: "a", offset: 99, text: "!", marks: [] } },
    { SplitBlock: { block_id: "a", offset: -1 } },
    { MoveBlock: { block_id: "a", new_parent_id: null, new_index: -1 } },
  ])(
    "rejects invalid offsets instead of duplicating, truncating or relocating content",
    async (step) => {
      const bridge = await createBridge([rich("a", "keep")]);
      const before = bridge.getState();
      expect(() => apply(bridge, step)).toThrow();
      expect(bridge.getState()).toBe(before);
    },
  );
});
