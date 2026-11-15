import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
// The package's own name: Node resolves its `node` condition, as it does for a consumer.
import init, { WasmEditor } from "@gotipe/wasm";

// Without an input the Node entry reads the binary from the package (D-12).
const output = await init();
assert.ok(output.memory instanceof WebAssembly.Memory);
assert.equal(await init(), output, "a second call keeps the initialised module");
assert.equal(
  await init({
    module_or_path: await readFile(new URL("../pkg/gotipe_wasm_bg.wasm", import.meta.url)),
  }),
  output,
  "an explicit input passes through",
);

const base = JSON.stringify({
  version: 0,
  blocks: [
    {
      id: "a",
      block_type: "paragraph",
      attrs: {},
      content: { type: "RichText", value: [{ text: "Node", marks: [] }] },
      children: [],
    },
  ],
});
const editor = WasmEditor.withDefaultSchema(base);
try {
  editor.apply(
    JSON.stringify({
      steps: [{ InsertText: { block_id: "a", offset: 4, text: " Ж😀", marks: [] } }],
      selection: null,
      metadata: {},
    }),
  );
  const [block] = JSON.parse(editor.export_json()).blocks;
  assert.equal(block.content.value.map((span) => span.text).join(""), "Node Ж😀");
} finally {
  editor.free();
}
console.log("WASM Node entry: the default init reads the binary from disk; edits apply.");
