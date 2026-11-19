import { afterEach, describe, expect, it } from "vitest";
import { ClipboardHandler } from "../src/clipboard/handler";
import { clipboardOptions } from "../src/editor/clipboard-options";
import {
  CustomEmoji,
  InlineImage,
  InlineMath,
  Mention,
  insertCustomEmoji,
  insertInlineImage,
  insertInlineMath,
  insertMention,
} from "../src/extensions/atoms";
import { MinimalPreset } from "../src/presets";
import type { Mark, TextSpan } from "../src/types/block";
import type { GoTipeEditor } from "../src/types/editor";
import type { Extension } from "../src/types/extension";
import { ENGINES, type Engine, createOn, doc, paragraph } from "./engines";

const ATOMS = [...MinimalPreset, Mention, InlineMath, CustomEmoji, InlineImage];
const editors: GoTipeEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});
async function open(engine: Engine, extensions: Extension[] = ATOMS, text = "Привет ") {
  const editor = await createOn(engine, { extensions, content: doc(paragraph("p", text)) });
  editors.push(editor);
  editor.setSelection({
    anchor: { blockId: "p", offset: text.length },
    head: { blockId: "p", offset: text.length },
  });
  return editor;
}
const spans = (editor: GoTipeEditor) => editor.getJSON().blocks[0]!.content as TextSpan[];
const withoutKeys = (list: TextSpan[]) =>
  list.map((span) => ({
    text: span.text,
    marks: span.marks.map(({ type, attrs }) => {
      const { key: _key, ...rest } = attrs;
      return { type, attrs: rest };
    }),
  }));
const keys = (list: TextSpan[]) =>
  list.flatMap((span) => span.marks.map((mark) => mark.attrs.key)).filter(Boolean);
function paste(editor: GoTipeEditor, extensions: Extension[], data: Record<string, string>) {
  const handler = new ClipboardHandler(
    editor,
    clipboardOptions(extensions, () => Promise.reject(new Error("no drafts"))),
  );
  handler.onPaste({
    preventDefault() {},
    clipboardData: { files: [], getData: (type: string) => data[type] ?? "" },
  } as unknown as ClipboardEvent);
}
async function sample(engine: Engine) {
  const editor = await open(engine);
  insertMention(editor, { id: "42", label: "Анна" });
  insertInlineMath(editor, "x^2");
  insertCustomEmoji(editor, { name: "party", src: "https://cdn.test/p.png" });
  insertInlineImage(editor, { src: "https://cdn.test/a.png", alt: "Схема", width: 40 });
  return editor;
}

describe.each(ENGINES)("inline atoms in and out of HTML on the %s engine", (engine) => {
  it("reads its own HTML back into atoms with fresh keys", async () => {
    const source = await sample(engine);
    const html = source.getHTML();
    const target = await open(engine, ATOMS, "");
    target.setContent(html);
    expect(target.getJSON().blocks).toHaveLength(1);
    expect(withoutKeys(spans(target))).toEqual(withoutKeys(spans(source)));
    const read = keys(spans(target));
    expect(read).toHaveLength(4);
    expect(new Set([...read, ...keys(spans(source))]).size).toBe(8);
    expect(target.getHTML()).toBe(html);
  });

  it("reads atoms its schema lacks as their text, never failing", async () => {
    const html = (await sample(engine)).getHTML();
    const plain = await open(engine, MinimalPreset, "");
    expect(() => plain.setContent(html)).not.toThrow();
    expect(plain.getJSON().blocks).toHaveLength(1);
    expect(spans(plain)).toEqual([{ text: "Привет @Аннаx^2:party:Схема", marks: [] }]);
    const errors: unknown[] = [];
    plain.on("error", (error) => errors.push(error));
    plain.setSelection({
      anchor: { blockId: plain.getJSON().blocks[0]!.id, offset: 0 },
      head: { blockId: plain.getJSON().blocks[0]!.id, offset: 0 },
    });
    paste(plain, MinimalPreset, { "text/html": html });
    expect(errors).toEqual([]);
    expect(plain.getText()).toBe("Привет @Аннаx^2:party:СхемаПривет @Аннаx^2:party:Схема");
  });

  it("pastes a copy of an atom under a new key, never joined to the original", async () => {
    const editor = await open(engine, ATOMS, "");
    insertMention(editor, { id: "42", label: "Анна" });
    const original = spans(editor);
    // Copy-paste right after itself: the same marks and key arrive next to the atom.
    paste(editor, ATOMS, { "application/x-gotipe": JSON.stringify({ spans: original }) });
    const after = spans(editor);
    expect(after).toHaveLength(2);
    expect(withoutKeys(after)).toEqual(withoutKeys([...original, ...original]));
    const [first, second] = keys(after);
    expect(first).toBe(original[0]!.marks[0]!.attrs.key);
    expect(second).not.toBe(first);
    // Backspace removes only the pasted copy.
    editor.dispatch({ steps: [{ type: "deleteText", blockId: "p", from: 9, to: 10 }] });
    expect(editor.getText()).toBe("@Анна");
    expect((spans(editor)[0]!.marks[0] as Mark).attrs.key).toBe(first);
  });
});
