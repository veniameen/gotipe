// @vitest-environment node
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import * as wasm from "../../wasm/pkg/gotipe_wasm.js";
import { createEditorWithLoader } from "../src/editor";
import { FullPreset } from "../src/presets";
import type { GoTipeEditor } from "../src/types/editor";

beforeAll(() => {
  wasm.initSync({
    module: readFileSync(new URL("../../wasm/pkg/gotipe_wasm_bg.wasm", import.meta.url)),
  });
});

const paragraph = (text: string) => ({
  version: 1,
  blocks: [{ id: "p", type: "paragraph", attrs: {}, content: [{ text, marks: [] }], children: [] }],
});
async function peers(content: object, ...ids: string[]): Promise<GoTipeEditor[]> {
  const editors = await Promise.all(
    ids.map(() =>
      createEditorWithLoader({ extensions: FullPreset, engine: "wasm", content }, async () => wasm),
    ),
  );
  editors.forEach((editor, index) => editor.enableCollaboration(ids[index]!));
  return editors;
}
const type = (editor: GoTipeEditor, offset: number, text: string) => {
  editor.setSelection({ anchor: { blockId: "p", offset }, head: { blockId: "p", offset } });
  editor.dispatch({ steps: [{ type: "insertText", blockId: "p", offset, text, marks: [] }] });
};
const format = (editor: GoTipeEditor, mark: string, from: number, to: number) => {
  editor.setSelection({
    anchor: { blockId: "p", offset: from },
    head: { blockId: "p", offset: to },
  });
  expect(editor.chain().toggleMark(mark).run()).toBe(true);
};
const read = (bytes: Uint8Array) =>
  JSON.parse(new TextDecoder().decode(bytes)) as {
    protocol: string;
    base?: object;
    operations: { id: { lamport: number; peer_id: string } }[];
    remaining?: number;
    acknowledged?: number;
  };
/** What a peer exports, byte for byte; `version` is each editor's own revision counter. */
const exported = (editor: GoTipeEditor) => JSON.stringify(editor.getJSON().blocks);

describe("incremental collaboration updates", () => {
  it("returns only this replica's operations after a clock, without the baseline", async () => {
    const [a, b] = await peers(paragraph("Привет 😀"), "a", "b");
    type(a, 0, "Ж");
    const first = a.getCollaborationUpdate({ after: 0 });
    expect(read(first)).toMatchObject({ protocol: "gotipe.crdt/2", remaining: 0 });
    expect(read(first).base).toBeUndefined();
    expect(read(first).operations.map((op) => op.id)).toEqual([{ lamport: 1, peer_id: "a" }]);
    expect(read(a.getCollaborationUpdate()).base).toBeDefined();
    b.receiveCollaborationUpdate(first);
    type(b, 0, "🦀");
    a.receiveCollaborationUpdate(b.getCollaborationUpdate({ after: 0 }));
    type(a, 2, "!");
    // The peer's operation took a later clock; it is never sent back.
    const second = read(a.getCollaborationUpdate({ after: 1 }));
    expect(second.operations.map((op) => op.id.peer_id)).toEqual(["a"]);
    expect(second.operations[0]!.id.lamport).toBeGreaterThan(2);
    b.receiveCollaborationUpdate(a.getCollaborationUpdate({ after: 1 }));
    expect(a.getText()).toBe(b.getText());
    expect(exported(a)).toBe(exported(b));
    a.destroy();
    b.destroy();
  });

  it("keeps an edit small in a document larger than a sync message", async () => {
    const content = paragraph("текст");
    content.blocks.push({
      id: "image",
      type: "image",
      attrs: { src: `data:image/png;base64,${"A".repeat(1 << 20)}`, caption: "" },
      content: null,
      children: [],
    } as never);
    const [a, b] = await peers(content, "a", "b");
    type(a, 5, "!");
    expect(a.getCollaborationUpdate().length).toBeGreaterThan(1 << 20);
    const delta = a.getCollaborationUpdate({ after: 0 });
    expect(delta.length).toBeLessThan(1024);
    b.receiveCollaborationUpdate(delta);
    expect(b.getText()).toBe(a.getText());
    expect(b.getText()).toContain("текст!");
    a.destroy();
    b.destroy();
  });

  it("splits a long offline session into ordered frames of bounded size", async () => {
    const [a, b] = await peers(paragraph(""), "a", "b");
    for (let index = 0; index < 30; index++) type(a, 0, "офлайн 😀 правка ".repeat(8));
    const budget = 32 * 1024;
    expect(a.getCollaborationUpdate().length).toBeGreaterThan(20 * budget);
    const sizes: number[] = [];
    for (let after = 0; ; ) {
      const frame = a.getCollaborationUpdate({ after, maxBytes: budget });
      const { operations, remaining } = read(frame);
      if (!operations.length) break;
      sizes.push(frame.length);
      expect(operations.every((op) => op.id.peer_id === "a" && op.id.lamport > after)).toBe(true);
      b.receiveCollaborationUpdate(frame);
      after = operations.at(-1)!.id.lamport;
      expect(read(a.getCollaborationUpdate({ after, maxBytes: 1 })).remaining).toBe(
        Math.max(0, (remaining ?? 0) - 1),
      );
    }
    expect(sizes.length).toBeGreaterThan(10);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(budget);
    expect(exported(a)).toBe(exported(b));
    a.destroy();
    b.destroy();
  });

  it("finds what a full state lacks, apart from this replica's newer operations", async () => {
    const [old, server, tab] = await peers(paragraph("AB"), "old-tab", "server", "new-tab");
    type(old, 0, "1");
    server.receiveCollaborationUpdate(old.getCollaborationUpdate({ after: 0 }));
    type(old, 0, "2");
    // The new tab restores the closed tab's copy and edits under its own peer ID.
    tab.receiveCollaborationUpdate(old.getCollaborationUpdate());
    type(tab, 0, "3");
    const missing = read(
      tab.getCollaborationUpdate({ missingFrom: server.getCollaborationUpdate() }),
    );
    expect(missing).toMatchObject({ protocol: "gotipe.crdt/2", acknowledged: 0 });
    expect(missing.operations.map((op) => op.id)).toEqual([{ lamport: 2, peer_id: "old-tab" }]);
    server.receiveCollaborationUpdate(
      tab.getCollaborationUpdate({ missingFrom: server.getCollaborationUpdate() }),
    );
    server.receiveCollaborationUpdate(tab.getCollaborationUpdate({ after: 0 }));
    expect(server.getText()).toBe(tab.getText());
    const settled = read(
      tab.getCollaborationUpdate({ missingFrom: server.getCollaborationUpdate() }),
    );
    expect(settled.operations).toEqual([]);
    expect(settled.acknowledged).toBe(3);
    for (const editor of [old, server, tab]) editor.destroy();
  });

  it("rejects a request it cannot answer exactly", async () => {
    const [a] = await peers(paragraph("text"), "a");
    for (const options of [
      { after: -1 },
      { after: 1.5 },
      { after: 2 ** 53 },
      { after: 0, maxBytes: -1 },
      { after: 0, maxBytes: 2 ** 32 },
      { missingFrom: "state" as unknown as Uint8Array },
    ])
      expect(() => a.getCollaborationUpdate(options)).toThrow(
        expect.objectContaining({ code: "COLLABORATION_ERROR" }),
      );
    expect(() => a.getCollaborationUpdate({ missingFrom: new Uint8Array([1, 2]) })).toThrow();
    a.destroy();
    const js = await createEditorWithLoader(
      { extensions: FullPreset, engine: "js", content: "x" },
      null,
    );
    expect(() => js.getCollaborationUpdate({ after: 0 })).toThrow("requires the WASM engine");
    js.destroy();
  });
});

describe("mark order between peers", () => {
  it("gives two peers identical JSON and HTML after concurrent formatting", async () => {
    const [a, b, c] = await peers(paragraph("Привет, мир 😀"), "a", "b", "c");
    format(a, "italic", 0, 6);
    format(a, "bold", 0, 6);
    expect(a.getJSON().blocks[0]!.content![0]!.marks.map((mark) => mark.type)).toEqual([
      "italic",
      "bold",
    ]);
    b.receiveCollaborationUpdate(a.getCollaborationUpdate({ after: 0 }));
    expect(exported(b)).toBe(exported(a));
    // Concurrent formatting of overlapping ranges, delivered in both orders.
    format(a, "underline", 3, 11);
    format(b, "code", 0, 9);
    format(b, "bold", 5, 14);
    const [fromA, fromB] = [a.getCollaborationUpdate(), b.getCollaborationUpdate()];
    a.receiveCollaborationUpdate(fromB);
    b.receiveCollaborationUpdate(fromA);
    c.receiveCollaborationUpdate(fromB);
    c.receiveCollaborationUpdate(fromA);
    expect(exported(a)).toBe(exported(b));
    expect(exported(a)).toBe(exported(c));
    expect(a.getHTML()).toBe(b.getHTML());
    expect(a.getHTML()).toBe(c.getHTML());
    for (const editor of [a, b, c]) editor.destroy();
  });

  it("keeps the author's own order through collaborative undo and redo", async () => {
    const [a, b] = await peers(paragraph("Привет"), "a", "b");
    format(a, "italic", 0, 6);
    format(a, "bold", 0, 6);
    const formatted = exported(a);
    expect(a.undo()).toBe(true);
    expect(a.redo()).toBe(true);
    expect(exported(a)).toBe(formatted);
    b.receiveCollaborationUpdate(a.getCollaborationUpdate());
    expect(exported(b)).toBe(formatted);
    a.destroy();
    b.destroy();
  });
});
