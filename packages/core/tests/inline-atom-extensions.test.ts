import { afterEach, describe, expect, it } from "vitest";
import { normalizeRemoteAtoms } from "../src/engine/remote-atoms";
import {
  CustomEmoji,
  InlineImage,
  InlineMath,
  Mention,
  getInlineMath,
  getMention,
  insertCustomEmoji,
  insertInlineImage,
  insertInlineMath,
  insertMention,
  updateInlineMath,
  updateMention,
} from "../src/extensions/atoms";
import { MinimalPreset } from "../src/presets";
import type { Document, TextSpan } from "../src/types/block";
import type { GoTipeEditor } from "../src/types/editor";
import { ENGINES, type Engine, createOn, doc, paragraph } from "./engines";

const editors: GoTipeEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});
async function open(engine: Engine, text = "Привет ") {
  const editor = await createOn(engine, {
    extensions: [...MinimalPreset, Mention, InlineMath, CustomEmoji, InlineImage],
    content: doc(paragraph("p", text)),
  });
  editors.push(editor);
  const end = text.length;
  editor.setSelection({
    anchor: { blockId: "p", offset: end },
    head: { blockId: "p", offset: end },
  });
  return editor;
}
const content = (editor: GoTipeEditor) => editor.getJSON().blocks[0]!.content;

describe.each(ENGINES)("inline atom extensions on the %s engine", (engine) => {
  it("inserts each atom with its fallback text and writes HTML and Markdown", async () => {
    const editor = await open(engine);
    expect(insertMention(editor, { id: "user 42", label: "Анна" })).toBe(true);
    expect(insertInlineMath(editor, "x^2")).toBe(true);
    expect(insertCustomEmoji(editor, { name: "party", src: "https://cdn.test/p.png" })).toBe(true);
    expect(
      insertInlineImage(editor, { src: "https://cdn.test/a.png", alt: "Схема", width: 40 }),
    ).toBe(true);
    expect(editor.getText()).toBe("Привет @Аннаx^2:party:Схема");
    expect(editor.getViewState().selection.head.offset).toBe(editor.getText().length);
    expect(editor.getHTML()).toBe(
      '<p>Привет <span data-type="mention" data-kind="user" data-id="user 42" data-label="Анна">@Анна</span>' +
        '<span data-type="math">x^2</span>' +
        '<img data-type="emoji" alt=":party:" src="https://cdn.test/p.png">' +
        '<img src="https://cdn.test/a.png" alt="Схема" width="40"></p>',
    );
    expect(editor.getMarkdown()).toBe(
      "Привет [@Анна](mention:user-user%2042)$x^2$:party:![Схема](https://cdn.test/a.png)\n",
    );
    // Typing after the last atom does not extend it.
    editor.dispatch({
      steps: [{ type: "insertText", blockId: "p", offset: 27, text: "!", marks: [] }],
    });
    expect(content(editor).at(-1)).toEqual({ text: "!", marks: [] });
  });

  it("clears formatting around and inside atoms but keeps the atoms", async () => {
    const editor = await open(engine);
    insertMention(editor, { id: "42", label: "Анна" });
    insertInlineMath(editor, "x^2");
    insertCustomEmoji(editor, { name: "party", src: "https://cdn.test/p.png" });
    insertInlineImage(editor, { src: "https://cdn.test/a.png", alt: "Схема" });
    const atoms = (content(editor) as TextSpan[]).slice(1);
    const all = { blockId: "p", offset: 0 };
    const end = { blockId: "p", offset: editor.getText().length };
    editor.setSelection({ anchor: all, head: end });
    expect(editor.chain().addMark("bold").run()).toBe(true);
    expect(editor.chain().clearFormatting().run()).toBe(true);
    // Mentions, formulas, custom emoji and inline images are content, not formatting.
    expect(content(editor)).toEqual([{ text: "Привет ", marks: [] }, ...atoms]);
    expect(editor.getText()).toBe("Привет @Аннаx^2:party:Схема");
  });

  it("refuses unsafe addresses, bad names and empty fallbacks", async () => {
    const editor = await open(engine);
    expect(insertCustomEmoji(editor, { name: "a b", src: "https://cdn.test/p.png" })).toBe(false);
    expect(insertCustomEmoji(editor, { name: "x", src: "javascript:alert(1)" })).toBe(false);
    expect(insertInlineImage(editor, { src: "data:text/html;base64,PHNjcmlwdD4=" })).toBe(false);
    expect(insertInlineMath(editor, "  ")).toBe(false);
    expect(insertMention(editor, { id: "", label: "Анна" })).toBe(false);
    expect(content(editor)).toEqual([{ text: "Привет ", marks: [] }]);
  });

  it("gives every atom a unique key and replaces a suggestion's range", async () => {
    const editor = await open(engine, "Привет @Ан");
    const anna = { id: "42", label: "Анна" };
    expect(insertMention(editor, anna, { blockId: "p", from: 7, to: 10 })).toBe(true);
    expect(insertMention(editor, anna)).toBe(true);
    const [, first, second] = content(editor) as TextSpan[];
    expect(first).toMatchObject({ text: "@Анна", marks: [{ attrs: { ...anna, kind: "user" } }] });
    expect(second).toMatchObject({ text: "@Анна", marks: [{ attrs: { ...anna, kind: "user" } }] });
    const keys = [first, second].map((span) => span!.marks[0]!.attrs.key);
    expect(keys.every((key) => typeof key === "string")).toBe(true);
    expect(keys[0]).not.toBe(keys[1]);
    // Backspace-like deletion removes only the second one.
    editor.dispatch({ steps: [{ type: "deleteText", blockId: "p", from: 16, to: 17 }] });
    expect(editor.getText()).toBe("Привет @Анна");
  });

  it("never joins equal atoms that become neighbours", async () => {
    const editor = await open(engine, "");
    const anna = { id: "42", label: "Анна" };
    insertMention(editor, anna);
    editor.dispatch({
      steps: [{ type: "insertText", blockId: "p", offset: 5, text: " ", marks: [] }],
      selection: { type: "cursor", blockId: "p", offset: 6 },
    });
    insertMention(editor, anna);
    // Deleting the space between them leaves two atoms: Backspace takes only the last.
    editor.dispatch({ steps: [{ type: "deleteText", blockId: "p", from: 5, to: 6 }] });
    expect(content(editor)).toHaveLength(2);
    editor.dispatch({ steps: [{ type: "deleteText", blockId: "p", from: 9, to: 10 }] });
    expect(editor.getText()).toBe("@Анна");
  });

  it("updates attributes in place and rewrites text as a new atom, each one undo step", async () => {
    const editor = await open(engine);
    insertMention(editor, { id: "42", label: "Анна" });
    insertInlineMath(editor, "x^2");
    const mention = getMention(editor, { blockId: "p", offset: 9 })!;
    expect(mention).toMatchObject({ from: 7, to: 12, text: "@Анна" });
    const key = mention.mark.attrs.key;
    expect(updateMention(editor, mention, { id: "43" })).toBe(true);
    expect((content(editor)[1] as TextSpan).marks[0]!.attrs).toEqual({
      id: "43",
      label: "Анна",
      kind: "user",
      key,
    });
    expect(
      updateMention(editor, getMention(editor, { blockId: "p", offset: 9 })!, { label: "Анна П." }),
    ).toBe(true);
    const renamed = (content(editor)[1] as TextSpan).marks[0]!.attrs;
    expect(renamed).toMatchObject({ id: "43", label: "Анна П.", kind: "user" });
    expect(renamed.key).not.toBe(key);
    const formula = getInlineMath(editor)!;
    expect(updateInlineMath(editor, formula, "\\frac{1}{2}")).toBe(true);
    expect(editor.getText()).toBe("Привет @Анна П.\\frac{1}{2}");
    expect(editor.undo()).toBe(true);
    expect(editor.getText()).toBe("Привет @Анна П.x^2");
    expect(editor.undo()).toBe(true);
    expect(editor.getText()).toBe("Привет @Аннаx^2");
  });
});

describe("normalizeRemoteAtoms", () => {
  const mention = { type: "mention", attrs: { id: "42", label: "Анна", kind: "user" } };
  const isAtomic = (type: string) => type === "mention";
  const one = (spans: TextSpan[]): Document => doc(paragraph("p", spans));

  it("strips the atomic mark from foreign text typed into an atom", () => {
    const before = one([
      { text: "a ", marks: [] },
      { text: "@Анна😀", marks: [mention] },
    ]);
    const after = one([
      { text: "a ", marks: [] },
      { text: "@Ан😎на😀", marks: [mention] },
    ]);
    const result = normalizeRemoteAtoms(before, after, isAtomic);
    expect(result.steps).toEqual([
      { type: "removeMark", blockId: "p", from: 5, to: 7, markType: "mention" },
    ]);
    expect(result.document.blocks[0]!.content).toEqual([
      { text: "a ", marks: [] },
      { text: "@Ан", marks: [mention] },
      { text: "😎", marks: [] },
      { text: "на😀", marks: [mention] },
    ]);
    // Text appended at the edge with the mark is foreign too.
    const edge = normalizeRemoteAtoms(
      before,
      one([
        { text: "a ", marks: [] },
        { text: "@Анна😀ё", marks: [mention] },
      ]),
      isAtomic,
    );
    expect(edge.steps).toEqual([
      { type: "removeMark", blockId: "p", from: 9, to: 10, markType: "mention" },
    ]);
  });

  it("keeps new, untouched and shortened atoms and returns the same document", () => {
    const before = one([{ text: "@Анна", marks: [mention] }]);
    for (const after of [
      before,
      one([
        { text: "x", marks: [] },
        { text: "@Анна", marks: [mention] },
      ]),
      one([{ text: "@Ан", marks: [mention] }]),
      one([{ text: "@Борис", marks: [{ ...mention, attrs: { ...mention.attrs, id: "7" } }] }]),
    ]) {
      const result = normalizeRemoteAtoms(before, after, isAtomic);
      expect(result.steps).toEqual([]);
      expect(result.document).toBe(after);
    }
  });
});
