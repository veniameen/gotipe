// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import * as wasm from "../../wasm/pkg/gotipe_wasm.js";
import { applyCollaborationState } from "../src/bootstrap";
import { Outbox } from "../src/outbox";
import { MESSAGE_LIMIT, decodeJSON, encodeJSON } from "../src/protocol";
import type { CollaborationEditor } from "../src/types";

/** The real engine behind the parts of the editor API the transport uses. */
type Replica = wasm.WasmEditor;
const replicas: Replica[] = [];
beforeAll(() => {
  wasm.initSync({
    module: readFileSync(new URL("../../wasm/pkg/gotipe_wasm_bg.wasm", import.meta.url)),
  });
});
afterEach(() => {
  for (const replica of replicas.splice(0)) replica.free();
});

const baseline = {
  version: 0,
  blocks: [
    {
      id: "p",
      block_type: "paragraph",
      attrs: {},
      content: { type: "RichText", value: [{ text: "x", marks: [] }] },
      children: [],
    },
  ],
};
function replica(peer: string): Replica {
  const editor = wasm.WasmEditor.withDefaultSchema(JSON.stringify(baseline));
  editor.enable_collaboration(peer);
  replicas.push(editor);
  return editor;
}
function editor(replica: Replica): CollaborationEditor {
  return {
    enableCollaboration: () => {},
    receiveCollaborationUpdate: (bytes: Uint8Array) => {
      replica.receive_update(bytes);
    },
    getCollaborationUpdate: (
      options?: { after: number; maxBytes?: number } | { missingFrom: Uint8Array },
    ) =>
      !options
        ? replica.get_update()
        : "missingFrom" in options
          ? replica.get_update_missing_from(options.missingFrom)
          : replica.get_local_update_after(options.after, options.maxBytes ?? 0),
  } as unknown as CollaborationEditor;
}
const transaction = (...steps: object[]) =>
  JSON.stringify({ steps, selection: null, metadata: {} });
const block = (id: string, type: string, attrs: object, text: string) => ({
  id,
  block_type: type,
  attrs,
  content: { type: "RichText", value: [{ text, marks: [] }] },
  children: [],
});
const blocks = (replica: Replica) => JSON.parse(replica.export_json()).blocks;
type Operations = { operations: { id: { lamport: number } }[] };
const read = (bytes: Uint8Array) => decodeJSON(bytes) as Operations;

describe("stored records", () => {
  it("load as one union whatever order compaction left them in", () => {
    const author = replica("author");
    author.apply(
      transaction({
        InsertBlock: {
          parent_id: null,
          index: 1,
          block: {
            id: "l",
            block_type: "orderedList",
            attrs: {},
            content: { type: "Empty" },
            children: [block("l1", "listItem", {}, "one")],
          },
        },
      }),
    );
    const list = read(author.get_local_update_after(0, 0));
    author.apply(
      transaction({
        InsertBlock: { parent_id: "l", index: 1, block: block("l2", "listItem", {}, "two") },
      }),
    );
    const item = read(author.get_local_update_after(list.operations.at(-1)!.id.lamport, 0));
    // A row saved during a compaction precedes the merged row holding its parent.
    const rows = [
      { protocol: "gotipe.crdt/2", operations: item.operations },
      { protocol: "gotipe.crdt/1", base: baseline, operations: list.operations },
    ];
    const oneByOne = replica("one-by-one");
    expect(() => oneByOne.receive_update(encodeJSON(rows[0]))).toThrow(/TopLevelNotAllowed/);
    const loaded = replica("loaded");
    applyCollaborationState(editor(loaded), { baseline, updates: rows }, "loaded");
    expect(blocks(loaded)).toEqual(blocks(author));
  });

  it("refuses records of different baselines", () => {
    const other = { ...baseline, blocks: [] };
    const loaded = replica("loaded");
    expect(() =>
      applyCollaborationState(
        editor(loaded),
        {
          baseline,
          updates: [
            { protocol: "gotipe.crdt/1", base: baseline, operations: [] },
            { protocol: "gotipe.crdt/1", base: other, operations: [] },
          ],
        },
        "loaded",
      ),
    ).toThrow(/different documents/);
  });
});

describe("a transaction larger than a message", () => {
  it("leaves in parts that a validating peer applies together", () => {
    const author = replica("author");
    const outbox = new Outbox();
    outbox.synchronize(editor(author), replica("server").get_update());
    // A 6,000-character heading and an image: each block needs its attribute.
    author.apply(
      transaction(
        {
          InsertBlock: {
            parent_id: null,
            index: 1,
            block: block("h", "heading", { level: 2 }, "ж".repeat(6000)),
          },
        },
        {
          InsertBlock: {
            parent_id: null,
            index: 2,
            block: {
              id: "i",
              block_type: "image",
              attrs: { src: "https://example.test/i.png" },
              content: { type: "Empty" },
              children: [],
            },
          },
        },
      ),
    );
    const frame = outbox.next(editor(author), "generation")!;
    expect(frame.payloads.length).toBeGreaterThan(1);
    const parts = frame.payloads.map(
      (payload) => decodeJSON(payload) as Operations & { continues?: boolean },
    );
    expect(parts.map((part) => part.continues === true)).toEqual(
      parts.map((_, index) => index < parts.length - 1),
    );
    expect(Math.max(...frame.payloads.map((payload) => payload.length))).toBeLessThan(
      MESSAGE_LIMIT,
    );
    // One part alone is half of the paste; a peer applies the transaction once.
    const early = replica("early");
    early.receive_update(frame.payloads[0]!);
    expect(blocks(early)).not.toEqual(blocks(author));
    const peer = replica("peer");
    peer.receive_update(
      encodeJSON({
        protocol: "gotipe.crdt/2",
        operations: parts.flatMap((part) => part.operations),
      }),
    );
    expect(blocks(peer)).toEqual(blocks(author));
    expect(frame.receipt).toEqual({ through: parts.at(-1)!.operations.at(-1)!.id.lamport });
  });
});
