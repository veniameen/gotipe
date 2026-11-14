import { afterEach, describe, expect, it } from "vitest";
import { Mention } from "../src/extensions/atoms";
import { createEditor } from "../src/js";
import { MinimalPreset } from "../src/presets";
import type { TextSpan } from "../src/types/block";
import type { GoTipeEditor } from "../src/types/editor";
import { type Extension, defineExtension } from "../src/types/extension";

/** A host's own atomic mention, with or without the atom support of the built-in ones. */
const ownMention = (withSupport: boolean) =>
  defineExtension({
    name: "ownMention",
    marks: Mention.marks,
    ...(withSupport ? { atomSupport: Mention.atomSupport } : {}),
  });

const editors: GoTipeEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});
async function open(extension: Extension) {
  const editor = await createEditor({ extensions: [...MinimalPreset, extension] });
  editors.push(editor);
  return editor;
}
const html = '<p>a <span data-type="mention" data-kind="user" data-id="42">@Анна</span></p>';
const spans = (editor: GoTipeEditor) => editor.getJSON().blocks[0]!.content as TextSpan[];

describe("atom support supplied by extensions", () => {
  it("is carried by every built-in atom extension", () => {
    expect(Mention.atomSupport).toBeDefined();
  });

  it("reads atom HTML back only when an extension supplies it", async () => {
    const plain = await open(ownMention(false));
    plain.setContent(html);
    expect(spans(plain)).toEqual([{ text: "a @Анна", marks: [] }]);

    const supported = await open(ownMention(true));
    supported.setContent(html);
    const [text, atom] = spans(supported);
    expect(text).toEqual({ text: "a ", marks: [] });
    expect(atom!.text).toBe("@Анна");
    expect(atom!.marks[0]).toMatchObject({
      type: "mention",
      attrs: { id: "42", kind: "user", label: "Анна" },
    });
    expect(typeof atom!.marks[0]!.attrs.key).toBe("string");
  });
});
