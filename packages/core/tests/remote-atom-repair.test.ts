// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { normalizeRemoteAtoms } from "../src/engine/remote-atoms";
import {
  InlineMath,
  Mention,
  getInlineMath,
  insertInlineMath,
  updateInlineMath,
} from "../src/extensions/atoms";
import { MinimalPreset } from "../src/presets";
import type { Document, TextSpan } from "../src/types/block";
import type { GoTipeEditor } from "../src/types/editor";
import { defineExtension } from "../src/types/extension";
import { createOn, doc, paragraph } from "./engines";

const mention = (key: string) => ({
  type: "mention",
  attrs: { id: "42", label: "Анна", kind: "user", key },
});
const math = (key: string) => ({ type: "inlineMath", attrs: { key } });
const isAtomic = (type: string) => type === "mention" || type === "inlineMath";
const one = (spans: TextSpan[]): Document => doc(paragraph("p", spans));

describe("normalizeRemoteAtoms by identity", () => {
  it("strips only characters inserted between an atom's old edges", () => {
    const before = one([
      { text: "a ", marks: [] },
      { text: "@Анна😀", marks: [mention("k1")] },
    ]);
    const after = one([
      { text: "a ", marks: [] },
      { text: "@Ан😎на😀", marks: [mention("k1")] },
    ]);
    expect(normalizeRemoteAtoms(before, after, isAtomic).steps).toEqual([
      { type: "removeMark", blockId: "p", from: 5, to: 7, markType: "mention" },
    ]);
  });

  it("keeps a second formula, a rewritten formula and a full state at connect", () => {
    const before = one([{ text: "x^2", marks: [math("k1")] }]);
    const cases: Document[] = [
      // A peer inserted another formula right after: another key, another atom.
      one([
        { text: "x^2", marks: [math("k1")] },
        { text: "y", marks: [math("k2")] },
      ]),
      // A peer rewrote the formula: new text under a new key.
      one([{ text: "x^2+1", marks: [math("k3")] }]),
      // Attributes only: the same key and text.
      one([{ text: "x^2", marks: [{ type: "inlineMath", attrs: { key: "k1", extra: 1 } }] }]),
    ];
    for (const after of cases)
      expect(normalizeRemoteAtoms(before, after, isAtomic).steps).toEqual([]);
    // A replica that had nothing yet receives the whole document.
    expect(normalizeRemoteAtoms(one([]), cases[0]!, isAtomic).steps).toEqual([]);
  });

  it("strips an orphan: foreign text left of an atom deleted here", () => {
    const after = one([{ text: "Z", marks: [mention("k1")] }]);
    const known = new Map([["mention#k1", "@Анна"]]);
    expect(normalizeRemoteAtoms(one([]), after, isAtomic, known).steps).toEqual([
      { type: "removeMark", blockId: "p", from: 0, to: 1, markType: "mention" },
    ]);
    // Never seen: a new atom.
    expect(normalizeRemoteAtoms(one([]), after, isAtomic).steps).toEqual([]);
  });
});

/** A client from before atoms: the same marks, typed into like any other. */
const Plain = defineExtension({
  name: "plain",
  marks: [
    {
      name: "mention",
      attrs: {
        id: { type: "string", required: true },
        label: { type: "string", required: true },
        kind: { type: "enum", values: ["user", "page"], default: "user" },
        key: { type: "string" },
      },
      rank: 200,
    },
    { name: "inlineMath", attrs: { key: { type: "string" } }, rank: 210 },
  ],
});

const editors: GoTipeEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});
async function replicas(content: TextSpan[]) {
  const make = async (peer: string, atomic: boolean) => {
    const editor = await createOn("wasm", {
      extensions: [...MinimalPreset, ...(atomic ? [Mention, InlineMath] : [Plain])],
      content: doc(paragraph("p", content)),
    });
    editor.enableCollaboration(peer);
    editors.push(editor);
    return editor;
  };
  return Promise.all([make("alice", true), make("bob", true), make("old", false)]);
}
const spans = (editor: GoTipeEditor) => editor.getJSON().blocks[0]!.content as TextSpan[];
function exchange(all: GoTipeEditor[]) {
  for (let round = 0; round < 3; round++)
    for (const from of all)
      for (const to of all)
        if (from !== to) to.receiveCollaborationUpdate(from.getCollaborationUpdate());
}
const converged = (all: GoTipeEditor[]) => {
  for (const editor of all) expect(spans(editor)).toEqual(spans(all[0]!));
};

describe("remote atom repair between replicas", () => {
  it("keeps a peer's second formula and a peer's rewritten formula", async () => {
    const all = await replicas([
      { text: "a ", marks: [] },
      { text: "x^2", marks: [math("k1")] },
    ]);
    const [alice, bob] = all;
    exchange(all);
    bob!.setSelection({ anchor: { blockId: "p", offset: 5 }, head: { blockId: "p", offset: 5 } });
    expect(insertInlineMath(bob!, "y")).toBe(true);
    exchange(all);
    expect(alice!.getText()).toBe("a x^2y");
    expect(spans(alice!).filter((span) => span.marks.length)).toHaveLength(2);
    expect(updateInlineMath(bob!, getInlineMath(bob!, { blockId: "p", offset: 3 })!, "z")).toBe(
      true,
    );
    exchange(all);
    expect(alice!.getText()).toBe("a zy");
    expect(spans(alice!).map((span) => span.marks.length)).toEqual([0, 1, 1]);
    converged(all);
  });

  it("strips an orphan everywhere and tags the repair as such", async () => {
    const all = await replicas([
      { text: "a ", marks: [] },
      { text: "@Анна", marks: [mention("k1")] },
    ]);
    const [alice, , old] = all;
    exchange(all);
    const origins: unknown[] = [];
    alice!.on("transaction", ({ transaction }) => origins.push(transaction.metadata?.origin));
    // Alice deletes the mention while the old client types inside it.
    alice!.dispatch({ steps: [{ type: "deleteText", blockId: "p", from: 2, to: 7 }] });
    old!.dispatch({
      steps: [{ type: "insertText", blockId: "p", offset: 4, text: "Z", marks: [mention("k1")] }],
    });
    alice!.receiveCollaborationUpdate(old!.getCollaborationUpdate());
    expect(spans(alice!)).toEqual([{ text: "a Z", marks: [] }]);
    expect(origins).toContain("repair");
    exchange(all);
    for (const editor of all) expect(spans(editor)).toEqual([{ text: "a Z", marks: [] }]);
  });
});
