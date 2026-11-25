import { createHeadlessEditor } from "@gotipe/core/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// @gotipe/export-wasm is an optional peer. Each test loads the exporter afresh, so no
// module or failure is kept from an earlier test.
const document = {
  version: 1,
  blocks: [
    {
      id: "p",
      type: "paragraph",
      attrs: {},
      children: [],
      content: [{ text: "Plain Ж😀", marks: [] }],
    },
  ],
};

beforeEach(() => {
  vi.doUnmock("@gotipe/export-wasm");
  vi.resetModules();
});

describe("without @gotipe/export-wasm installed", () => {
  it("exports HTML and Markdown; PDF and DOCX reject with EXPORTER_UNAVAILABLE", async () => {
    vi.doMock("@gotipe/export-wasm", () => {
      throw new Error("Cannot find module '@gotipe/export-wasm'");
    });
    const { exportToDocx, exportToHtml, exportToMarkdown, exportToPdf } = await import("./index");
    const editor = await createHeadlessEditor({ extensions: [] });
    try {
      editor.setContent(document);
      expect(exportToHtml(editor)).toContain("Plain Ж😀");
      expect(exportToMarkdown(editor)).toContain("Plain Ж😀");
      for (const exportBinary of [exportToPdf, exportToDocx]) {
        const error = await exportBinary(editor).catch((reason: unknown) => reason);
        expect(error).toMatchObject({
          name: "GoTipeExportError",
          code: "EXPORTER_UNAVAILABLE",
          message: expect.stringContaining("Install @gotipe/export-wasm"),
        });
        expect((error as Error).cause).toMatchObject({
          message: expect.stringMatching(/^@gotipe\/export-wasm could not be imported/),
        });
      }
    } finally {
      editor.destroy();
    }
  });
});

describe("with @gotipe/export-wasm installed", () => {
  it("a WASM asset that fails to load rejects with its failure as the cause; the next call tries again", async () => {
    const failure = new Error("Failed to fetch gotipe_export_wasm_bg.wasm");
    let attempts = 0;
    vi.doMock("@gotipe/export-wasm", () => ({
      default: () => {
        attempts += 1;
        return attempts === 1 ? Promise.reject(failure) : Promise.resolve();
      },
    }));
    const { loadExporters } = await import("./wasm");
    await expect(loadExporters()).rejects.toMatchObject({
      code: "EXPORTER_UNAVAILABLE",
      cause: failure,
    });
    await expect(loadExporters()).resolves.toBeDefined();
    expect(attempts).toBe(2);
  });
});
