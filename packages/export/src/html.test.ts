import { createHeadlessEditor } from "@gotipe/core/server";
import { describe, expect, it } from "vitest";
import { exportToDocx } from "./docx";
import { exportToHtml } from "./html";
import { exportToMarkdown } from "./markdown";
import { exportToPdf } from "./pdf";

async function editor() {
  const instance = await createHeadlessEditor({ extensions: [] });
  instance.setContent({
    version: 1,
    blocks: [
      {
        id: "p",
        type: "paragraph",
        attrs: {},
        children: [],
        content: [{ text: "Привет <world>", marks: [] }],
      },
    ],
  });
  return instance;
}

describe("public format options", () => {
  it("shares HTML styles and classes with the headless serializer without mutating the document", async () => {
    const instance = await editor();
    try {
      const before = instance.getJSON();
      const html = exportToHtml(instance, { classPrefix: "article-", includeStyles: true });
      expect(html).toContain('class="article-paragraph"');
      expect(html).toContain("line-height:1.5");
      expect(html).toContain("Привет &lt;world&gt;");
      expect(instance.getJSON()).toEqual(before);
      expect(exportToHtml(instance)).toBe(instance.getHTML());
    } finally {
      instance.destroy();
    }
  });

  it("accepts inlineStyles, the serializer's name, and keeps includeStyles working", async () => {
    const instance = await editor();
    try {
      const styled = exportToHtml(instance, { inlineStyles: true });
      expect(styled).toContain("line-height:1.5");
      expect(exportToHtml(instance, { includeStyles: true })).toBe(styled);
      expect(exportToHtml(instance, { includeStyles: false })).toBe(instance.getHTML());
      expect(() => exportToHtml(instance, { inlineStyles: true, includeStyles: false })).toThrow(
        TypeError,
      );
    } finally {
      instance.destroy();
    }
  });

  it("rejects HTML options for other formats before loading the compiler", async () => {
    const instance = await editor();
    try {
      const options = { inlineStyles: true };
      expect(() => Reflect.apply(exportToMarkdown, undefined, [instance, options])).toThrow(
        "Unsupported export option",
      );
      await expect(Reflect.apply(exportToPdf, undefined, [instance, options])).rejects.toThrow(
        "Unsupported export option",
      );
      await expect(Reflect.apply(exportToDocx, undefined, [instance, options])).rejects.toThrow(
        "Unsupported export option",
      );
    } finally {
      instance.destroy();
    }
  });
});
