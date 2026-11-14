// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { Mention } from "../src/extensions/atoms";
import { MinimalPreset } from "../src/presets";
import type { TextSpan } from "../src/types/block";
import type { GoTipeEditor } from "../src/types/editor";
import { defineExtension } from "../src/types/extension";
import { createOn, doc, paragraph } from "./engines";

const mention = { type: "mention", attrs: { id: "42", label: "Анна", kind: "user" } };
/** A client from before the atom: the same mark, typed into like any other. */
const PlainMention = defineExtension({
  name: "mention",
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
  ],
});

const editors: GoTipeEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});
async function replica(peer: string, atomic: boolean) {
  const editor = await createOn("wasm", {
    extensions: [...MinimalPreset, atomic ? Mention : PlainMention],
    content: doc(
      paragraph("p", [
        { text: "a ", marks: [] },
        { text: "@Анна", marks: [mention] },
      ]),
    ),
  });
  editor.enableCollaboration(peer);
  editors.push(editor);
  return editor;
}
const spans = (editor: GoTipeEditor) => editor.getJSON().blocks[0]!.content as TextSpan[];
/** Delivers every replica's full state to every other until nothing changes. */
function exchange(replicas: GoTipeEditor[]) {
  for (let round = 0; round < 3; round++)
    for (const from of replicas)
      for (const to of replicas)
        if (from !== to) to.receiveCollaborationUpdate(from.getCollaborationUpdate());
}

describe("remote text inside an inline atom", () => {
  it("loses the atomic mark on every replica, which converge", async () => {
    const [alice, bob, old] = await Promise.all([
      replica("alice", true),
      replica("bob", true),
      replica("old", false),
    ]);
    // The old client types inside the mention and keeps its mark.
    old.dispatch({
      steps: [{ type: "insertText", blockId: "p", offset: 5, text: "ё", marks: [mention] }],
    });
    expect(spans(old)).toEqual([
      { text: "a ", marks: [] },
      { text: "@Анёна", marks: [mention] },
    ]);
    alice.receiveCollaborationUpdate(old.getCollaborationUpdate());
    const repaired = [
      { text: "a ", marks: [] },
      { text: "@Ан", marks: [mention] },
      { text: "ё", marks: [] },
      { text: "на", marks: [mention] },
    ];
    expect(spans(alice)).toEqual(repaired);
    // The repair is not an edit of the user's: it is not undone.
    expect(alice.getViewState().toolbar.canUndo).toBe(false);
    exchange([alice, bob, old]);
    for (const editor of [alice, bob, old]) expect(spans(editor)).toEqual(repaired);
  });
});
