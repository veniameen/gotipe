import { describe, expect, it } from "vitest";
import { FullPreset } from "../src/presets";
import { renderToHtml, renderToMarkdown, renderToText } from "../src/ssr";
import { ENGINES, createOn, doc, paragraph } from "./engines";

// D-185: `validate` and `renderTo*` take a document object only — the host calls `JSON.parse`.
// A string is HTML only in `content` and `setContent`, so one string never means two things.
const document = doc(paragraph("a", "Привет 😀"));
const json = JSON.stringify(document);
const html = "<p>Привет 😀</p>";
// The types refuse a string; a JavaScript caller can still pass one.
const untyped = (value: string) => value as unknown as object;

describe.each(ENGINES)("%s engine: validate takes a document object (D-185)", (engine) => {
  it("returns false for a JSON or HTML string and true for the parsed document", async () => {
    const editor = await createOn(engine, { extensions: FullPreset, content: document });
    expect(editor.validate(JSON.parse(json))).toBe(true);
    expect(editor.validate(untyped(json))).toBe(false);
    expect(editor.validate(untyped(html))).toBe(false);
    editor.destroy();
  });

  it("still reads a string as HTML in content and setContent", async () => {
    const editor = await createOn(engine, { extensions: FullPreset, content: html });
    expect(editor.getText()).toBe("Привет 😀");
    editor.setContent("<p>Ёж</p>");
    expect(editor.getText()).toBe("Ёж");
    editor.destroy();
  });
});

describe("server rendering takes a document object (D-185)", () => {
  it.each([
    ["renderToHtml", renderToHtml],
    ["renderToMarkdown", renderToMarkdown],
    ["renderToText", renderToText],
  ] as const)("%s rejects a string with a TypeError that names JSON.parse", async (_, render) => {
    for (const value of [json, html]) {
      const rendering = render(untyped(value));
      await expect(rendering).rejects.toBeInstanceOf(TypeError);
      await expect(rendering).rejects.toThrow("JSON.parse(json)");
    }
    expect(await render(JSON.parse(json))).toContain("Привет 😀");
  });
});
