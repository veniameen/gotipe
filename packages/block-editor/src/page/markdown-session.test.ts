import type { GoTipeEditor } from "@gotipe/core";
import { createEditor } from "@gotipe/core/js";
import { type MarkdownSnapshot, serializeMarkdown } from "@gotipe/markdown";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownSession } from "./markdown-session";
import { pageExtensions } from "./page-editor";

/** The platform crypto, kept before a test stubs the global. */
const platform = globalThis.crypto;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MarkdownSession on a page served over plain HTTP (D-28, D-85)", () => {
  it("adds the synthetic title of a file without one, without crypto.randomUUID", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (array: Uint8Array) => platform.getRandomValues(array),
    });
    const session = new MarkdownSession({ ensureTitle: true });
    const doc = session.parse("Body text\n");
    const title = doc.blocks[0]!;
    expect(title.type).toBe("heading");
    expect(title.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(session.isSyntheticTitle(title.id)).toBe(true);
    expect(doc.blocks[1]!.type).toBe("paragraph");
  });
});

const PAGE = [
  "# Notes",
  "",
  "Hello [@Anna](mention:user-42) and *all*   ",
  "second line",
  "",
  "* one",
  "* two",
  "",
  "| a | b |",
  "|---|:-:|",
  "| 1 | 2 |",
  "",
  "```ts",
  "const a = 1;",
  "```",
  "",
  "Last __paragraph__.",
  "",
].join("\n");

describe("MarkdownSession.serialize on the editor's view", () => {
  const open = async () => {
    const session = new MarkdownSession({ ensureTitle: true, atoms: { mention: true } });
    const editor = await createEditor({
      extensions: pageExtensions({ mentions: true }),
      content: session.parse(PAGE),
      engine: "js",
    });
    return { session, editor };
  };
  const last = (editor: GoTipeEditor) => editor.getViewState().blocks.at(-1)!;

  it("writes an untouched page byte for byte, with atoms and decorations in the view", async () => {
    const { session, editor } = await open();
    const mention = editor.getViewState().blocks[1]!;
    expect(JSON.stringify(mention.content)).toContain('"atomic":true');
    editor.setDecorations("test", [
      { type: "inline", key: "k", blockId: mention.id, from: 0, to: 3, className: "mark" },
    ]);
    session.touch();
    expect(session.serialize(editor).text).toBe(PAGE);
    editor.destroy();
  });

  it("writes each edit as a writer without kept fingerprints does", async () => {
    const { session, editor } = await open();
    // what the session wrote before it kept fingerprints: the document, with its own snapshot
    const kept = () => (session as unknown as { snapshot: MarkdownSnapshot }).snapshot;
    for (const [step, text] of ["x", "Ж", "😀"].entries()) {
      const target = editor.getViewState().blocks[step === 1 ? 1 : 5]!;
      editor.dispatch({
        steps: [{ type: "insertText", blockId: target.id, offset: 0, text, marks: [] }],
      });
      session.touch();
      const plain = serializeMarkdown(editor.getJSON() as never, kept());
      const written = session.serialize(editor);
      expect(written.text).toBe(plain.text);
      expect(written.map).toEqual(plain.map);
      expect(kept()).toEqual(plain.snapshot);
    }
    expect(session.serialize(editor).text).toContain("ЖHello [@Anna](mention:user-42) and *all*");
    expect(session.serialize(editor).text).toContain("|---|:-:|");
    expect(session.serialize(editor).text).toContain("* one\n* two\n");
    expect(session.serialize(editor).text).toContain("😀xLast **paragraph**.");
    expect(last(editor).type).toBe("paragraph");
    editor.destroy();
  });
});
