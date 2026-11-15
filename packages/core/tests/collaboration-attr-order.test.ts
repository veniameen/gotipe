// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { DefaultPreset } from "../src/presets";
import type { GoTipeEditor } from "../src/types/editor";
import { block, createOn, doc, text } from "./engines";

// D-82: peers write equal block and mark attributes in one key order, so the same document
// is the same JSON on every replica.
const editors: GoTipeEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});
const cell = block("c1", "tableCell", text("ячейка 😀"));
const content = doc(block("t", "table", null, {}, [block("r", "tableRow", null, {}, [cell])]));

it("replicas write cell and link attributes in one key order", async () => {
  const [a, b] = await Promise.all(
    ["a", "b"].map(async (peer) => {
      const editor = await createOn("wasm", { extensions: DefaultPreset, content });
      editor.enableCollaboration(peer);
      editors.push(editor);
      return editor;
    }),
  );
  const link = {
    type: "link",
    attrs: { title: "Т", target: "_self", rel: "nofollow", href: "/x" },
  };
  a!.dispatch({
    steps: [
      { type: "setBlockAttrs", blockId: "c1", attrs: { rowspan: 1, colspan: 1, align: "center" } },
      { type: "addMark", blockId: "c1", from: 0, to: 6, mark: link },
    ],
  });
  b!.receiveCollaborationUpdate(a!.getCollaborationUpdate());
  const written = JSON.stringify(a!.getJSON().blocks);
  expect(JSON.stringify(b!.getJSON().blocks)).toBe(written);
  const target = a!.getJSON().blocks[0]!.children[0]!.children[0]!;
  expect(Object.keys(target.attrs)).toEqual(["align", "colspan", "rowspan"]);
  const spans = target.content as { marks: { attrs: Record<string, unknown> }[] }[];
  expect(Object.keys(spans[0]!.marks[0]!.attrs)).toEqual(["href", "rel", "target", "title"]);
});
