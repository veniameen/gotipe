import { afterEach, describe, expect, it } from "vitest";
import { Math as MathExtension } from "../src/extensions/math";
import { Paragraph } from "../src/extensions/paragraph";
import { FullPreset } from "../src/presets";
import type { Document } from "../src/types/block";
import type { CreateEditorOptions } from "../src/types/editor";
import { defineExtension } from "../src/types/extension";
import { ENGINES, type Engine, block, createOn, doc, mountForTyping, paragraph } from "./engines";

/** A raw-text node type of your own: Enter treats it as it treats code and formulas. */
const Snippet = defineExtension({
  name: "snippet",
  nodes: [
    {
      name: "snippet",
      group: ["block"],
      content: "rawText",
      attrs: {},
      topLevel: true,
      marksAllowed: "none",
      leaf: false,
      allowsChildren: false,
    },
  ],
});

const views: ReturnType<typeof mountForTyping>[] = [];
afterEach(() => {
  for (const view of views.splice(0)) view.remove();
});

async function mount(
  engine: Engine,
  content: Document,
  extensions: CreateEditorOptions["extensions"] = [FullPreset, Snippet],
) {
  const errors: unknown[] = [];
  const editor = await createOn(engine, {
    extensions,
    content,
    host: { onError: (error) => errors.push(error) },
  });
  const view = mountForTyping(editor);
  views.push(view);
  return {
    editor,
    errors,
    view,
    /** A `beforeinput` the browser sends for Enter. */
    input(inputType: "insertParagraph" | "insertLineBreak") {
      const event = new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType });
      view.element.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    },
    blocks: () => (editor.getJSON() as Document).blocks,
    anchor: () => editor.getViewState().selection.anchor,
  };
}

const formula = (id: string, tex: string) => block(id, "math", tex, { display: "block" });

describe.each(ENGINES)("%s Enter in raw text (D-11)", (engine) => {
  it("Enter adds a line to a formula instead of splitting it, as one undo step", async () => {
    const t = await mount(engine, doc(paragraph("p", "Before"), formula("m", "a+b")));
    t.view.caret("m", 1);
    t.input("insertParagraph");
    expect(t.blocks()).toEqual([paragraph("p", "Before"), formula("m", "a\n+b")]);
    expect(t.anchor()).toEqual({ blockId: "m", offset: 2 });
    t.view.type("c");
    expect(t.blocks()[1]!.content).toBe("a\nc+b");
    expect(t.editor.undo()).toBe(true);
    expect(t.blocks()[1]!.content).toBe("a\n+b");
    expect(t.editor.undo()).toBe(true);
    expect(t.blocks()).toEqual([paragraph("p", "Before"), formula("m", "a+b")]);
    expect(t.errors).toEqual([]);
  });

  it("Enter at the end of a formula starts a new line in it; over a selection it replaces it", async () => {
    const t = await mount(engine, doc(formula("m", "\\frac{a}{b}"), paragraph("p", "Ж😀")));
    t.view.caret("m", 11);
    t.input("insertParagraph");
    expect(t.blocks()[0]).toEqual(formula("m", "\\frac{a}{b}\n"));
    expect(t.anchor()).toEqual({ blockId: "m", offset: 12 });
    t.editor.setSelection({
      anchor: { blockId: "m", offset: 6 },
      head: { blockId: "m", offset: 9 },
    });
    t.input("insertParagraph");
    expect(t.blocks()).toEqual([formula("m", "\\frac{\nb}\n"), paragraph("p", "Ж😀")]);
    expect(t.errors).toEqual([]);
  });

  it("Enter that the browser reports as a line break adds a line too", async () => {
    const t = await mount(engine, doc(formula("m", "a+b")));
    t.view.caret("m", 1);
    t.input("insertLineBreak");
    expect(t.blocks()).toEqual([formula("m", "a\n+b")]);
    expect(t.errors).toEqual([]);
  });

  it("Shift+Enter in a formula is a line break, as before", async () => {
    const t = await mount(engine, doc(formula("m", "a+b")));
    t.view.caret("m", 1);
    t.view.key("Enter", { shiftKey: true });
    t.input("insertParagraph");
    expect(t.blocks()).toEqual([formula("m", "a\n+b")]);
  });

  it("Enter adds a line to a raw-text node of your own", async () => {
    const t = await mount(engine, doc(block("s", "snippet", "ab"), paragraph("p", "")));
    t.view.caret("s", 1);
    t.input("insertParagraph");
    expect(t.blocks()).toEqual([block("s", "snippet", "a\nb"), paragraph("p", "")]);
    expect(t.errors).toEqual([]);
  });

  it("Enter adds a line to a raw-text node of your own without content", async () => {
    const t = await mount(engine, doc(block("s", "snippet", null)));
    t.view.caret("s", 0);
    t.input("insertParagraph");
    expect(t.blocks()).toEqual([block("s", "snippet", "\n")]);
    expect(t.errors).toEqual([]);
  });

  it("Enter still adds a line to a code block and splits a paragraph", async () => {
    const code = block("c", "codeBlock", "ab", { language: "" });
    const t = await mount(engine, doc(code, paragraph("p", "xy")));
    t.view.caret("c", 1);
    t.input("insertParagraph");
    t.view.caret("p", 1);
    t.input("insertParagraph");
    expect(t.blocks()).toMatchObject([
      { ...code, content: "a\nb" },
      paragraph("p", "x"),
      { type: "paragraph", content: [{ text: "y", marks: [] }] },
    ]);
  });

  it("without a schema, Enter adds a line to any block that holds raw text", async () => {
    const t = await mount(engine, doc(formula("m", "a+b"), block("c", "codeBlock", "x")), []);
    t.view.caret("m", 1);
    t.input("insertParagraph");
    t.view.caret("c", 1);
    t.input("insertLineBreak");
    expect(t.blocks()).toEqual([formula("m", "a\n+b"), block("c", "codeBlock", "x\n")]);
  });
});

describe.each(ENGINES)("%s Escape leaves a formula (D-11)", (engine) => {
  it("adds an empty paragraph after the formula and moves the caret there, also without CodeBlock", async () => {
    const t = await mount(engine, doc(formula("m", "x^2"), paragraph("p", "Next")), [
      Paragraph,
      MathExtension,
    ]);
    t.view.caret("m", 3);
    expect(t.view.key("Escape").defaultPrevented).toBe(true);
    const [first, added, last] = t.blocks();
    expect(first).toEqual(formula("m", "x^2"));
    expect(added).toMatchObject({ type: "paragraph", content: [], children: [] });
    expect(last).toEqual(paragraph("p", "Next"));
    expect(t.anchor()).toEqual({ blockId: added!.id, offset: 0 });
  });

  it("does nothing outside a formula", async () => {
    const t = await mount(engine, doc(paragraph("p", "Text")), [Paragraph, MathExtension]);
    t.view.caret("p", 2);
    expect(t.view.key("Escape").defaultPrevented).toBe(false);
    expect(t.blocks()).toEqual([paragraph("p", "Text")]);
  });
});
