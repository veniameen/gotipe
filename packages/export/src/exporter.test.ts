import { createHeadlessEditor } from "@gotipe/core/server";
import { describe, expect, it } from "vitest";
import corpus from "../../../crates/gotipe-export/tests/fixtures/pdf-corpus.json";
import { exportToDocx } from "./docx";
import { ExportError } from "./errors";
import { exportToPdf } from "./pdf";

async function editor(id: string) {
  const fixture = corpus.cases.find((entry) => entry.id === id);
  if (!fixture) throw new Error(`Missing corpus case ${id}`);
  const instance = await createHeadlessEditor({ extensions: [] });
  instance.setContent(fixture.document);
  return instance;
}
const ascii = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);

describe("optional PDF/DOCX exporter", () => {
  it("exports what the editor inserts: WebP, placeholders, inline files and relative links", async () => {
    const instance = await editor("editor-content");
    try {
      const before = instance.getJSON();
      const pdf = await exportToPdf(instance);
      const docx = await exportToDocx(instance);
      expect(ascii(pdf.subarray(0, 5))).toBe("%PDF-");
      expect([...docx.subarray(0, 2)]).toEqual([0x50, 0x4b]);
      expect(pdf.buffer).toBeInstanceOf(ArrayBuffer);
      expect(new Blob([pdf, docx]).size).toBe(pdf.byteLength + docx.byteLength);
      expect(instance.getJSON()).toEqual(before);
    } finally {
      instance.destroy();
    }
  });

  it("declares the requested language, title and author", async () => {
    const instance = await editor("editor-content");
    try {
      const plain = ascii(await exportToPdf(instance));
      expect(plain).not.toContain("/Lang");
      const pdf = ascii(await exportToPdf(instance, { lang: "ru", title: "Plan", author: "Ann" }));
      expect(pdf).toContain("/Lang (ru)");
      expect(pdf).toContain("/Title (Plan)");
      expect(pdf).toContain("/Author (Ann)");
    } finally {
      instance.destroy();
    }
  });

  it("rejects with ExportError carrying a stable code", async () => {
    const instance = await editor("unknown-block");
    try {
      const error = await exportToPdf(instance).catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(ExportError);
      expect(error).toMatchObject({ code: "UNSUPPORTED_BLOCK_TYPE", name: "GoTipeExportError" });
      expect(String(error)).toMatch(/Unsupported block type: customBlock/);
      await expect(exportToPdf(instance, { lang: "en_US" })).rejects.toMatchObject({
        code: "INVALID_OPTIONS",
      });
      await expect(exportToDocx(instance)).rejects.toMatchObject({
        code: "UNSUPPORTED_BLOCK_TYPE",
      });
    } finally {
      instance.destroy();
    }
  });
});
