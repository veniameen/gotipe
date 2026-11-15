// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createEditor } from "../src/index";
import { DefaultPreset } from "../src/presets";
import { doc, paragraph } from "./engines";

describe("default WASM loader in Node (D-12)", () => {
  it("loads @gotipe/wasm through its node condition: no fetch of a file: URL", async () => {
    const warnings: unknown[] = [];
    const editor = await createEditor({
      extensions: [DefaultPreset],
      engine: "auto",
      content: doc(paragraph("p", "Ж😀")),
      host: { onError: (error) => warnings.push(error) },
    });
    try {
      expect(editor.engine).toBe("wasm");
      expect(
        editor.dispatch({
          steps: [{ type: "insertText", blockId: "p", offset: 0, text: "Node ", marks: [] }],
        }),
      ).toBe(true);
      expect(editor.getText()).toBe("Node Ж😀");
      expect(warnings).toEqual([]);
    } finally {
      editor.destroy();
    }
  });
});
