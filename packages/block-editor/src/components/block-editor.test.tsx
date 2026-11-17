// @vitest-environment jsdom
import type { Decoration } from "@gotipe/core";
import { Placeholder } from "@gotipe/core/extensions";
import { type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { DefaultPreset } from "@gotipe/core/presets";
import { EditorContent, GoTipeI18nProvider } from "@gotipe/react";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PageEditor } from "../page/page-editor";
import { BlockEditor } from "./block-editor";
import { type RemotePeer, peersFromDecorations } from "./collaboration-cursors";

let container: HTMLDivElement;
let root: Root;
const editors: GoTipeEditor[] = [];
const frame = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 40)));

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom has no layout: every range is one empty rectangle.
  const rect = {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    toJSON() {},
  };
  Range.prototype.getBoundingClientRect = () => rect as DOMRect;
  Range.prototype.getClientRects = () => [rect] as unknown as DOMRectList;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  for (const editor of editors.splice(0)) editor.destroy();
  container.remove();
});

async function editorWith(
  text: string,
  extensions: Parameters<typeof createEditor>[0]["extensions"] = [DefaultPreset],
) {
  const editor = await createEditor({
    extensions,
    content: {
      version: 1,
      blocks: [
        {
          id: "p",
          type: "paragraph",
          attrs: {},
          content: text ? [{ text, marks: [] }] : [],
          children: [],
        },
      ],
    },
  });
  editors.push(editor);
  return editor;
}
const ann: Decoration = {
  type: "remote-cursor",
  peerId: "ann",
  blockId: "p",
  offset: 2,
  user: { name: "Ann", color: "#2c62d4" },
};
const annSelection: Decoration = {
  type: "remote-selection",
  peerId: "ann",
  blockId: "p",
  from: 0,
  to: 2,
  color: "#2c62d4",
};
const carets = (peerId: string) =>
  container.querySelectorAll(`.gotipe-remote-cursor[data-peer-id="${peerId}"]`);

describe("other people in BlockEditor: one owner draws them", () => {
  it("draws the provider's layer with its overlay when no peers are passed", async () => {
    const editor = await editorWith("hello");
    act(() => root.render(<BlockEditor editor={editor} showBlockToolbar={false} />));
    act(() => editor.setDecorations("collaboration", [ann, annSelection]));
    await frame();
    expect(carets("ann")).toHaveLength(1);
    const caret = carets("ann")[0]!;
    // The overlay of Atlas frame 12, not an inline widget inside the text.
    expect(caret.closest(".gotipe-collaboration-cursors")).not.toBeNull();
    expect(caret.closest("[data-gotipe-content]")).toBeNull();
    expect(caret.querySelector(".gotipe-remote-cursor-label")?.textContent).toBe("Ann");
    expect(container.querySelectorAll(".gotipe-remote-selection")).toHaveLength(1);
    expect(container.querySelector(".gotipe-remote-range")).toBeNull();
    expect(container.querySelector('[data-block-id="p"]')?.textContent).toBe("hello");
    act(() => editor.setDecorations("collaboration", []));
    await frame();
    expect(carets("ann")).toHaveLength(0);
  });

  it("draws a peer once when the host also passes it, and the host's other peers", async () => {
    const editor = await editorWith("hello");
    const peers: RemotePeer[] = [
      {
        peerId: "ann",
        user: { name: "Ann", color: "#2c62d4" },
        cursor: { blockId: "p", offset: 2 },
      },
      {
        peerId: "bob",
        user: { name: "Bob", color: "#c2410c" },
        cursor: { blockId: "p", offset: 4 },
      },
    ];
    act(() => {
      root.render(<BlockEditor editor={editor} remotePeers={peers} showBlockToolbar={false} />);
      editor.setDecorations("collaboration", [ann]);
    });
    await frame();
    expect(carets("ann")).toHaveLength(1);
    expect(carets("bob")).toHaveLength(1);
    expect(container.querySelectorAll(".gotipe-remote-cursor")).toHaveLength(2);
  });

  it("draws nobody with showCollaborationCursors={false} (D-47)", async () => {
    const editor = await editorWith("hello");
    const bob: RemotePeer = {
      peerId: "bob",
      user: { name: "Bob", color: "#c2410c" },
      cursor: { blockId: "p", offset: 4 },
    };
    act(() => {
      root.render(
        <BlockEditor
          editor={editor}
          remotePeers={[bob]}
          showCollaborationCursors={false}
          showBlockToolbar={false}
        />,
      );
      editor.setDecorations("collaboration", [ann]);
    });
    await frame();
    expect(container.querySelector(".gotipe-collaboration-cursors")).toBeNull();
    expect(container.querySelectorAll(".gotipe-remote-cursor")).toHaveLength(0);
  });

  it("EditorContent draws the layer inline unless the host takes it", async () => {
    const editor = await editorWith("hello");
    act(() => {
      root.render(<EditorContent editor={editor} />);
      editor.setDecorations("collaboration", [ann]);
      editor.setDecorations("comments", [
        {
          type: "comment-highlight",
          commentId: "c",
          blockId: "p",
          from: 0,
          to: 2,
          resolved: false,
        },
      ]);
    });
    expect(carets("ann")).toHaveLength(1);
    act(() => root.render(<EditorContent editor={editor} hostLayers={["collaboration"]} />));
    expect(carets("ann")).toHaveLength(0);
    expect(container.querySelector(".gotipe-comment-highlight")?.textContent).toBe("he");
    expect(peersFromDecorations(editor.getDecorations("collaboration"))).toEqual([
      {
        peerId: "ann",
        user: { name: "Ann", color: "#2c62d4" },
        cursor: { blockId: "p", offset: 2 },
      },
    ]);
  });
});

describe("the document's name follows the interface language (D-195)", () => {
  const name = () => container.querySelector("[data-gotipe-content]")?.getAttribute("aria-label");

  it.each([
    ["ru", "Содержимое документа"],
    ["en", "Document content"],
  ])("BlockEditor without ariaLabel in %s", async (locale, words) => {
    const editor = await editorWith("Text");
    act(() =>
      root.render(
        <GoTipeI18nProvider locale={locale}>
          <BlockEditor editor={editor} showBlockToolbar={false} />
        </GoTipeI18nProvider>,
      ),
    );
    expect(name()).toBe(words);
    act(() =>
      root.render(
        <GoTipeI18nProvider locale={locale}>
          <BlockEditor editor={editor} showBlockToolbar={false} ariaLabel="Notes" />
        </GoTipeI18nProvider>,
      ),
    );
    expect(name()).toBe("Notes");
  });
});

describe("placeholder words follow the interface language", () => {
  const placeholder = () =>
    container.querySelector('[data-block-id="p"]')?.getAttribute("data-placeholder");
  const blurred = (editor: GoTipeEditor) =>
    act(() =>
      editor.setSelection({ anchor: { blockId: "", offset: 0 }, head: { blockId: "", offset: 0 } }),
    );

  it.each([
    ["ru", "Введите «/» для блоков"],
    ["en", "Text"],
  ])("BlockEditor with DefaultPreset in %s", async (locale, words) => {
    const editor = await editorWith("");
    expect(editor.getDecorations()).toEqual([{ type: "placeholder", text: "", blockId: "p" }]);
    act(() =>
      root.render(
        <GoTipeI18nProvider locale={locale}>
          <BlockEditor editor={editor} showBlockToolbar={false} />
        </GoTipeI18nProvider>,
      ),
    );
    expect(placeholder()).toBe(words);
    // The Placeholder extension keeps it on the empty document away from the caret too.
    blurred(editor);
    expect(placeholder()).toBe(words);
  });

  it("a configured text and a host function win over the interface words", async () => {
    const editor = await editorWith("", [DefaultPreset, Placeholder.configure({ text: "Write…" })]);
    act(() =>
      root.render(
        <GoTipeI18nProvider locale="en">
          <EditorContent editor={editor} />
        </GoTipeI18nProvider>,
      ),
    );
    expect(placeholder()).toBe("Write…");
    act(() => root.render(<EditorContent editor={editor} placeholder={() => "Host"} />));
    expect(placeholder()).toBe("Host");
  });

  it.each([
    ["ru", "Без названия", "Введите «/» для блоков"],
    ["en", "Untitled", "Text"],
  ])("PageEditor in %s", async (locale, title, paragraph) => {
    let editor: GoTipeEditor | null = null;
    const ready = (value: GoTipeEditor) => {
      editor = value;
    };
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    await act(async () => {
      root.render(<PageEditor markdown="" locale={locale} autoFocus={false} onReady={ready} />);
      await wait(60);
    });
    const words = () =>
      [...container.querySelectorAll("[data-placeholder]")].map((element) =>
        element.getAttribute("data-placeholder"),
      );
    expect(words()).toEqual([title]);
    await act(async () => {
      (editor as unknown as GoTipeEditor).dispatch({
        steps: [
          {
            type: "insertBlock",
            parentId: null,
            index: 1,
            block: { id: "np", type: "paragraph", attrs: {}, content: [], children: [] },
          },
        ],
        selection: { type: "cursor", blockId: "np", offset: 0 },
      });
      await wait(30);
    });
    expect(words()).toEqual([title, paragraph]);
  });
});
