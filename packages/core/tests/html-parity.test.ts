// @vitest-environment node
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import fixture from "../../../crates/gotipe-export/tests/fixtures/html-parity.json";
import * as wasm from "../../wasm/pkg/gotipe_wasm.js";
import { createEditorWithLoader } from "../src/editor";
import { type HtmlBlock, blocksToHtml } from "../src/serialization/html";

/** The server's Rust exporter checks the same fixture (crates/gotipe-export/tests/html_parity.rs). */
const cases = fixture.cases.map((entry) => ({
  id: entry.id,
  blocks: entry.document.blocks as HtmlBlock[],
  options: "options" in entry ? entry.options : {},
  html: entry.html,
}));

beforeAll(() => {
  wasm.initSync({
    module: readFileSync(new URL("../../wasm/pkg/gotipe_wasm_bg.wasm", import.meta.url)),
  });
});

describe("one HTML contract", () => {
  it.each(cases)("serializes $id", ({ blocks, options, html }) => {
    expect(blocksToHtml(blocks, options)).toBe(html);
  });

  it.each(cases.filter((entry) => Object.keys(entry.options).length === 0))(
    "getHTML() of $id is the same on the JS and WASM engines",
    async ({ blocks, html }) => {
      for (const engine of ["js", "wasm"] as const) {
        const editor = await createEditorWithLoader(
          { extensions: [], engine, content: { version: 1, blocks } },
          async () => wasm,
        );
        try {
          expect(editor.engine).toBe(engine);
          expect(editor.getHTML()).toBe(html);
        } finally {
          editor.destroy();
        }
      }
    },
  );

  it("accepts includeStyles as the name of inlineStyles", () => {
    const { blocks } = cases.find((entry) => entry.id === "options-both")!;
    const styled = blocksToHtml(blocks, { classPrefix: "_x-1", inlineStyles: true });
    expect(blocksToHtml(blocks, { classPrefix: "_x-1", includeStyles: true })).toBe(styled);
    expect(blocksToHtml(blocks, { inlineStyles: true, includeStyles: true })).toContain("style=");
    expect(() => blocksToHtml(blocks, { inlineStyles: true, includeStyles: false })).toThrow(
      "must not disagree",
    );
    expect(() =>
      Reflect.apply(blocksToHtml, undefined, [blocks, { includeStyles: "yes" }]),
    ).toThrow("includeStyles must be boolean");
  });
});
