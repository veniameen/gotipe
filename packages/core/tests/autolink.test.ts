import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Autolink,
  CodeBlock,
  InlineCode,
  Link,
  LinkOnPaste,
  Paragraph,
  linkHref,
} from "../src/extensions";
import { toSafeHref } from "../src/security/urls";
import type { Mark } from "../src/types/block";
import type { Extension } from "../src/types/extension";
import { ENGINES, block, createOn, doc, mountForTyping, paragraph } from "./engines";

const link = (href: string): Mark => ({
  type: "link",
  attrs: { href, target: "_blank", rel: "noopener noreferrer" },
});
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

describe("address detection", () => {
  it("accepts whole web and mail addresses and rejects unsafe or partial ones", () => {
    expect(linkHref("https://пример.рф/путь?q=1")).toBe("https://пример.рф/путь?q=1");
    expect(linkHref("www.example.com", "http")).toBe("http://www.example.com");
    expect(linkHref("mailto:ann@example.com")).toBe("mailto:ann@example.com");
    expect(linkHref("http://localhost:3000")).toBe("http://localhost:3000");
    for (const value of [
      "https://",
      "www.",
      "https://intranet",
      "mailto:ann",
      "javascript:alert(1)",
    ])
      expect(linkHref(value), value).toBeNull();
  });

  it("never yields an address the editor's link check would change or refuse", () => {
    for (const value of [
      "https://example.com/a?b=1#c",
      "HTTP://EXAMPLE.COM",
      "www.пример.рф",
      "mailto:a.b@example.co.uk?subject=x",
      "https://a.b/%00",
      "data:text/html,https://a.b",
      "vbscript://a.b",
    ]) {
      const href = linkHref(value);
      if (href) expect(toSafeHref(href), value).toBe(href);
    }
    expect(linkHref("data:text/html,https://a.b")).toBeNull();
  });
});

describe.each(ENGINES)("%s autolink", (engine) => {
  async function typing(initial: string, extensions: Extension[] = [Link, InlineCode, Autolink]) {
    const editor = await createOn(engine, {
      extensions: [Paragraph, CodeBlock, ...extensions],
      content: doc(paragraph("p", initial)),
    });
    const surface = mountForTyping(editor);
    cleanups.push(() => surface.remove());
    surface.caret("p", initial.length);
    return { editor, surface, content: () => editor.getJSON().blocks[0]!.content };
  }

  it("links an address when a space is typed after it, as its own undo step", async () => {
    const { editor, surface, content } = await typing("См. (www.пример.рф).");
    surface.type(" ");
    expect(content()).toEqual([
      { text: "См. (", marks: [] },
      { text: "www.пример.рф", marks: [link("https://www.пример.рф")] },
      { text: "). ", marks: [] },
    ]);
    expect(editor.undo()).toBe(true);
    expect(content()).toEqual([{ text: "См. (www.пример.рф). ", marks: [] }]);
    surface.caret("p", 0);
    surface.type("x ");
    expect(content()).toEqual([{ text: "x См. (www.пример.рф). ", marks: [] }]);
  });

  it("links before Enter and lets Enter split the block", async () => {
    const { editor, surface } = await typing("😀 mailto:ann@example.com");
    const event = surface.key("Enter");
    expect(event.defaultPrevented).toBe(false);
    expect(editor.getJSON().blocks[0]!.content).toEqual([
      { text: "😀 ", marks: [] },
      { text: "mailto:ann@example.com", marks: [link("mailto:ann@example.com")] },
    ]);
  });

  it("does not link unsafe text, inline code, existing links or without the Link mark", async () => {
    const unsafe = await typing("javascript://example.com/%0aalert(1)");
    unsafe.surface.type(" ");
    expect(unsafe.content()).toEqual([
      { text: "javascript://example.com/%0aalert(1) ", marks: [] },
    ]);
    const code = await typing("");
    code.editor.dispatch({
      steps: [
        {
          type: "insertText",
          blockId: "p",
          offset: 0,
          text: "https://a.io",
          marks: [{ type: "code", attrs: {} }],
        },
      ],
    });
    code.surface.caret("p", 12);
    code.surface.type(" ");
    expect(code.editor.getText()).toBe("https://a.io ");
    expect(JSON.stringify(code.content())).not.toContain('"link"');
    const plain = await typing("https://a.io", [Autolink]);
    plain.surface.type(" ");
    expect(plain.content()).toEqual([{ text: "https://a.io ", marks: [] }]);
  });
});

describe.each(ENGINES)("%s link on paste", (engine) => {
  async function setup(content = doc(paragraph("p", "Читать здесь"))) {
    const errors = vi.fn();
    const editor = await createOn(engine, {
      extensions: [Paragraph, CodeBlock, Link, InlineCode, LinkOnPaste],
      content,
      host: { onError: errors },
    });
    const root = document.createElement("div");
    document.body.append(root);
    editor.mount(root);
    cleanups.push(() => {
      editor.destroy();
      root.remove();
    });
    const paste = (text: string) => {
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", {
        value: { files: [], getData: (type: string) => (type === "text/plain" ? text : "") },
      });
      root.dispatchEvent(event);
    };
    return { editor, paste, errors };
  }

  it("links the selected text with a pasted address in one undo step", async () => {
    const { editor, paste, errors } = await setup();
    editor.setSelection({
      anchor: { blockId: "p", offset: 7 },
      head: { blockId: "p", offset: 12 },
    });
    paste("  https://example.com/a?b=1\n");
    await vi.waitFor(() =>
      expect(editor.getJSON().blocks[0]!.content).toEqual([
        { text: "Читать ", marks: [] },
        { text: "здесь", marks: [link("https://example.com/a?b=1")] },
      ]),
    );
    expect(errors).not.toHaveBeenCalled();
    expect(editor.undo()).toBe(true);
    expect(editor.getJSON().blocks[0]!.content).toEqual([{ text: "Читать здесь", marks: [] }]);
  });

  it("inserts a bare address as a link, and as text in code", async () => {
    const { editor, paste } = await setup(
      doc(paragraph("p", "a"), block("c", "codeBlock", "x", { language: "" })),
    );
    editor.setSelection({ anchor: { blockId: "p", offset: 1 }, head: { blockId: "p", offset: 1 } });
    paste("www.example.com");
    await vi.waitFor(() =>
      expect(editor.getJSON().blocks[0]!.content).toEqual([
        { text: "a", marks: [] },
        { text: "www.example.com", marks: [link("https://www.example.com")] },
      ]),
    );
    editor.setSelection({ anchor: { blockId: "c", offset: 1 }, head: { blockId: "c", offset: 1 } });
    paste("https://example.com");
    await vi.waitFor(() =>
      expect(editor.getJSON().blocks[1]!.content).toBe("xhttps://example.com"),
    );
  });
});
