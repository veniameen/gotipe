import { describe, expect, it } from "vitest";
import { buildSchema, resolveExtensions } from "../src/editor/extensions";
import { toWasmDoc } from "../src/engine/conversion";
import { applyTransaction, fallbackApply } from "../src/engine/js-transactions";
import { toWasmSchema } from "../src/engine/schema";
import { EngineStates } from "../src/engine/states";
import type { FallbackDoc } from "../src/engine/types";
import { validateEngineDocument } from "../src/engine/validate";
import { FullPreset } from "../src/presets";
import { ENGINES, block, createOn, doc, paragraph, text } from "./engines";

const item = (id: string, value: string) => block(id, "listItem", text(value));
const source = () =>
  doc(
    paragraph("a", "Привет 😀"),
    block("list", "bulletList", null, {}, [item("i1", "one"), item("i2", "two")]),
    paragraph("b", [{ text: "bold", marks: [{ type: "bold", attrs: {} }] }]),
    paragraph("c", "last"),
  );
const state = (): FallbackDoc => JSON.parse(JSON.stringify(toWasmDoc(source())));

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

const paragraphBlock = (id: string, value: string) => ({
  id,
  block_type: "paragraph",
  attrs: {},
  content: { type: "RichText", value: [{ text: value, marks: [] }] },
  children: [],
});
const TRANSACTIONS: Record<string, unknown>[][] = [
  [{ InsertText: { block_id: "a", offset: 6, text: "мир ", marks: [] } }],
  [{ DeleteText: { block_id: "i2", from: 0, to: 1 } }],
  [{ AddMark: { block_id: "c", from: 0, to: 2, mark: { mark_type: "bold", attrs: {} } } }],
  [{ RemoveMark: { block_id: "b", from: 0, to: 2, mark_type: "bold" } }],
  [{ InsertBlock: { parent_id: null, index: 1, block: paragraphBlock("n", "new") } }],
  [{ DeleteBlock: { block_id: "i1" } }],
  [{ DeleteBlock: { block_id: "b" } }],
  [{ SetBlockType: { block_id: "c", new_type: "heading", attrs: { level: 2 } } }],
  [{ SetBlockAttrs: { block_id: "a", attrs: { align: "center" } } }],
  [{ MoveBlock: { block_id: "i2", new_parent_id: null, new_index: 0 } }],
  [{ MoveBlock: { block_id: "c", new_parent_id: "i1", new_index: 0 } }],
  [{ SplitBlock: { block_id: "i1", offset: 1 } }],
  [{ MergeBlocks: { block_id: "c", target_id: "a" } }],
  [{ DeleteRange: { block_id: "a", from: 0, to: 6 } }],
  [
    { SplitBlock: { block_id: "a", offset: 6 } },
    { InsertText: { block_id: "a", offset: 6, text: "!", marks: [] } },
    { DeleteBlock: { block_id: "list" } },
  ],
];

describe("a transaction on a shared state", () => {
  it.each(TRANSACTIONS)("leaves the state it starts from as it is: %j", (...steps) => {
    const transaction = JSON.stringify({ steps });
    const base = freeze(state());
    const before = JSON.stringify(base);
    const after = applyTransaction(base, transaction);
    expect(JSON.stringify(base)).toBe(before);
    // a split names its new block itself
    const named = (json: string) => json.replace(/"id":"[0-9a-f-]{36}"/g, '"id":"new"');
    expect(named(JSON.stringify(after))).toBe(named(fallbackApply(before, transaction)));
  });

  it("shares the top-level blocks no step names", () => {
    const base = state();
    const after = applyTransaction(
      base,
      JSON.stringify({
        steps: [{ InsertText: { block_id: "i2", offset: 0, text: "x", marks: [] } }],
      }),
    );
    expect(after.blocks.map((entry, index) => entry === base.blocks[index])).toEqual([
      true,
      false,
      true,
      true,
    ]);
    expect(after.version).toBe(base.version + 1);
  });

  it("leaves nothing behind when a later step fails", () => {
    const base = freeze(state());
    const before = JSON.stringify(base);
    const steps = [
      { InsertText: { block_id: "a", offset: 0, text: "x", marks: [] } },
      { DeleteBlock: { block_id: "missing" } },
    ];
    expect(() => applyTransaction(base, JSON.stringify({ steps }))).toThrow(/Block not found/);
    expect(JSON.stringify(base)).toBe(before);
  });
});

describe("EngineStates", () => {
  const schema = toWasmSchema(buildSchema(resolveExtensions(FullPreset)));

  it("writes a state as JSON.stringify does and parses its own text once", () => {
    const states = new EngineStates();
    const base = state();
    const json = states.stringify(base);
    expect(json).toBe(JSON.stringify(base));
    expect(states.parse(json)).toBe(base);
    const next = applyTransaction(
      base,
      JSON.stringify({
        steps: [{ InsertText: { block_id: "c", offset: 4, text: "!", marks: [] } }],
      }),
    );
    expect(states.stringify(next)).toBe(JSON.stringify(next));
    expect(states.stringify({ version: 3, blocks: [] })).toBe('{"version":3,"blocks":[]}');
  });

  it("decodes an unchanged top-level block once and a changed one anew", () => {
    const states = new EngineStates();
    const base = state();
    const first = states.decode(base);
    expect(first).toEqual(source());
    const next = applyTransaction(
      base,
      JSON.stringify({
        steps: [{ InsertText: { block_id: "c", offset: 4, text: "!", marks: [] } }],
      }),
    );
    const second = states.decode(next);
    expect(second.blocks.map((entry, index) => entry === first.blocks[index])).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(second.blocks[3]!.content).toEqual(text("last!"));
  });

  it("validates as validateEngineDocument does, also with blocks it has seen", () => {
    const states = new EngineStates();
    const base = state();
    expect(states.validate(schema, base)).toBe(true);
    const cases: FallbackDoc[] = [
      // a block seen before, twice: the ids are checked across blocks
      { version: 2, blocks: [base.blocks[0]!, base.blocks[0]!] },
      { version: 2, blocks: [base.blocks[0]!, { ...base.blocks[2]!, id: "i1" }, base.blocks[1]!] },
      // not a top-level block
      { version: 2, blocks: [base.blocks[0]!, base.blocks[1]!.children[0]!] },
      { version: 2, blocks: [{ ...base.blocks[0]!, block_type: "unknown" }, base.blocks[3]!] },
      { version: -1, blocks: base.blocks },
      { version: 2, blocks: [...base.blocks, null as never] },
    ];
    for (const value of cases) {
      const outcome = (check: () => boolean) => {
        try {
          return check();
        } catch (error) {
          return (error as Error).message;
        }
      };
      const expected = outcome(() =>
        validateEngineDocument(schema, JSON.parse(JSON.stringify(value))),
      );
      expect(outcome(() => states.validate(schema, value))).toEqual(expected);
      expect(expected).not.toBe(true);
    }
    expect(states.validate(schema, base)).toBe(true);
  });
});

describe.each(ENGINES)("an edit of one block on the %s engine", (engine) => {
  it("keeps the view objects of the other blocks and hands out documents of the caller's own", async () => {
    const editor = await createOn(engine, { extensions: FullPreset, content: source() });
    const before = editor.getViewState().blocks;
    editor.dispatch({
      steps: [{ type: "insertText", blockId: "a", offset: 0, text: "x", marks: [] }],
    });
    const after = editor.getViewState().blocks;
    expect(after.map((entry, index) => entry === before[index])).toEqual([false, true, true, true]);
    const first = editor.getJSON();
    first.blocks[1]!.children[0]!.content = text("changed by the caller");
    first.blocks[3]!.attrs.align = "right";
    expect(editor.getJSON().blocks[1]!.children[0]!.content).toEqual(text("one"));
    expect(editor.getViewState().blocks[3]!.attrs).toEqual({});
    editor.destroy();
  });

  it("gives transaction listeners detached documents", async () => {
    const editor = await createOn(engine, { extensions: FullPreset, content: source() });
    const seen: string[] = [];
    editor.on("transaction", (context) => {
      expect(Object.keys(context)).toEqual(["editor", "transaction", "before", "after"]);
      context.after.blocks[0]!.content = text("changed by the listener");
      seen.push(JSON.stringify(context.before.blocks[0]!.content));
    });
    editor.dispatch({
      steps: [{ type: "insertText", blockId: "a", offset: 0, text: "x", marks: [] }],
    });
    expect(seen).toEqual([JSON.stringify(text("Привет 😀"))]);
    expect(editor.getJSON().blocks[0]!.content).toEqual(text("xПривет 😀"));
    expect(editor.getViewState().blocks[0]!.content).toEqual(text("xПривет 😀"));
    editor.destroy();
  });
});
