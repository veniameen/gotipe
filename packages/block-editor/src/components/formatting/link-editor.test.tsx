// @vitest-environment jsdom
import { type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { DefaultPreset } from "@gotipe/core/presets";
import { EditorContent, GoTipeI18nProvider } from "@gotipe/react";
import { type ReactNode, act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FixedToolbar } from "../../toolbar/fixed-toolbar";
import { LinkEditor } from "./link-editor";

let container: HTMLDivElement;
let root: Root;
const editors: GoTipeEditor[] = [];
const frame = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 40)));

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const rect = { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  Range.prototype.getBoundingClientRect = () => ({ ...rect, toJSON() {} }) as DOMRect;
  Range.prototype.getClientRects = () => [rect] as unknown as DOMRectList;
  Element.prototype.scrollIntoView = () => {};
  Object.defineProperty(navigator, "platform", { value: "MacIntel", configurable: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  for (const editor of editors.splice(0)) editor.destroy();
  container.remove();
});

async function editorWith(text: string) {
  const editor = await createEditor({
    extensions: [DefaultPreset],
    content: {
      version: 1,
      blocks: [
        { id: "p0", type: "paragraph", attrs: {}, content: [{ text, marks: [] }], children: [] },
      ],
    },
  });
  editors.push(editor);
  return editor;
}

function show(node: ReactNode) {
  act(() => root.render(<GoTipeI18nProvider locale="ru">{node}</GoTipeI18nProvider>));
}
const select = (editor: GoTipeEditor, from: number, to: number) =>
  act(() =>
    editor.setSelection({
      anchor: { blockId: "p0", offset: from },
      head: { blockId: "p0", offset: to },
    }),
  );
/** Mod+K pressed in the text, as the core `Link` extension hears it. */
async function modK() {
  const event = new KeyboardEvent("keydown", {
    key: "k",
    code: "KeyK",
    metaKey: true,
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    container.querySelector("[data-gotipe-content]")?.dispatchEvent(event);
  });
  await frame();
  return event;
}
const fields = () => [...container.querySelectorAll<HTMLElement>(".gotipe-link-editor")];
/** The field's last button: Cancel. */
const cancel = (field: HTMLElement) => [...field.querySelectorAll("button")].at(-1)?.click();
const type = (input: HTMLInputElement, value: string) =>
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

describe("Mod+K opens the link field (openLinkDialog)", () => {
  it("over selected text: the field takes the keys and links the selection", async () => {
    const editor = await editorWith("Drafts are kept");
    show(
      <>
        <EditorContent editor={editor} />
        <LinkEditor editor={editor} atSelection />
      </>,
    );
    select(editor, 0, 6);
    const key = await modK();
    expect(key.defaultPrevented).toBe(true);
    expect(fields()).toHaveLength(1);
    const input = fields()[0]!.querySelector("input")!;
    expect(document.activeElement).toBe(input);
    await type(input, "https://example.com/путь");
    act(() => fields()[0]!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
    const [linked, rest] = editor.getJSON().blocks[0]!.content as {
      text: string;
      marks: { type: string; attrs?: { href?: string } }[];
    }[];
    expect(linked?.text).toBe("Drafts");
    expect(linked?.marks[0]?.attrs?.href).toBe("https://example.com/путь");
    expect(rest?.marks).toEqual([]);
    expect(fields()).toHaveLength(0);
  });

  it("starts from the address of the link under the selection", async () => {
    const editor = await editorWith("Drafts are kept");
    show(
      <>
        <EditorContent editor={editor} />
        <FixedToolbar editor={editor} />
      </>,
    );
    select(editor, 7, 10);
    act(() => editor.chain().setMark("link", { href: "https://example.com/" }).run());
    select(editor, 0, 0);
    select(editor, 7, 10);
    await modK();
    expect(fields()[0]?.querySelector("input")?.value).toBe("https://example.com/");
  });

  it("shows the link under the caret in the fixed toolbar as it moves (D-129)", async () => {
    const editor = await editorWith("Drafts are kept");
    show(<FixedToolbar editor={editor} />);
    const tool = () => container.querySelector('[data-gotipe-fixed-toolbar] [data-mark="link"]')!;
    select(editor, 7, 10);
    act(() => editor.chain().setMark("link", { href: "https://example.com/" }).run());
    select(editor, 1, 1);
    expect(tool().getAttribute("aria-pressed")).toBe("false");
    // the toolbar draws nothing else on this change: the tool follows the caret by itself
    select(editor, 8, 8);
    expect(tool().getAttribute("aria-pressed")).toBe("true");
    expect(tool().classList.contains("active")).toBe(true);
    select(editor, 12, 12);
    expect(tool().getAttribute("aria-pressed")).toBe("false");
  });

  it("opens nothing at a caret alone: Atlas draws the field only over selected text", async () => {
    const editor = await editorWith("Drafts are kept");
    show(
      <>
        <EditorContent editor={editor} />
        <LinkEditor editor={editor} atSelection />
      </>,
    );
    select(editor, 3, 3);
    expect((await modK()).defaultPrevented).toBe(true);
    expect(fields()).toHaveLength(0);
  });

  it("opens one field: the bubble's before the fixed toolbar's, the toolbar's without one", async () => {
    const editor = await editorWith("Drafts are kept");
    const page = (toolbar: string, bubble: boolean) => (
      <>
        <EditorContent editor={editor} />
        <FixedToolbar key={toolbar} editor={editor} />
        {bubble ? (
          <div className="bubble">
            <LinkEditor editor={editor} atSelection />
          </div>
        ) : null}
      </>
    );
    /** Where the one field Mod+K opened stands; Cancel closes it. */
    const opened = async () => {
      select(editor, 0, 6);
      await modK();
      expect(fields()).toHaveLength(1);
      const field = fields()[0]!;
      const place = field.closest(".bubble")
        ? "bubble"
        : field.closest("[data-gotipe-fixed-toolbar]")
          ? "toolbar"
          : "?";
      act(() => cancel(field));
      return place;
    };
    // the bubble comes after the toolbar, and stays first when the toolbar mounts again
    show(page("a", true));
    expect(await opened()).toBe("bubble");
    show(page("b", true));
    expect(await opened()).toBe("bubble");
    show(page("b", false));
    expect(await opened()).toBe("toolbar");
  });

  it("passes over a tool out of reach or unable to act", async () => {
    const editor = await editorWith("Drafts are kept");
    show(
      <>
        <EditorContent editor={editor} />
        <div className="closed-more">
          <LinkEditor editor={editor} atSelection />
        </div>
        <LinkEditor editor={editor} />
      </>,
    );
    // the toolbar's closed “More” is inert: its tool passes, the next one opens
    const more = container.querySelector<HTMLElement>(".closed-more")!;
    more.inert = true;
    select(editor, 0, 6);
    await modK();
    expect(fields()).toHaveLength(1);
    expect(fields()[0]!.closest(".closed-more")).toBeNull();
    act(() => cancel(fields()[0]!));

    // code takes no marks; a read-only editor takes no links
    more.inert = false;
    act(() => editor.chain().setBlockType("codeBlock").run());
    select(editor, 0, 6);
    await modK();
    expect(fields()).toHaveLength(0);
    act(() => editor.chain().setBlockType("paragraph").run());
    act(() => editor.setEditable(false));
    select(editor, 0, 6);
    await modK();
    expect(fields()).toHaveLength(0);
  });

  it("listens once per editor and stops when the last tool goes", async () => {
    const editor = await editorWith("Drafts");
    const on = editor.on.bind(editor);
    const stops: ReturnType<typeof vi.fn>[] = [];
    vi.spyOn(editor, "on").mockImplementation(((event, handler) => {
      const stop = vi.fn(on(event, handler));
      if (event === "openLinkDialog") stops.push(stop);
      return stop;
    }) as GoTipeEditor["on"]);
    const tools = (bubble: boolean, toolbar: boolean) => (
      <>
        {bubble ? <LinkEditor editor={editor} atSelection /> : null}
        {toolbar ? <LinkEditor editor={editor} /> : null}
      </>
    );
    show(tools(true, true));
    expect(stops).toHaveLength(1);
    show(tools(false, true));
    expect(stops[0]).not.toHaveBeenCalled();
    show(tools(false, false));
    expect(stops).toHaveLength(1);
    expect(stops[0]).toHaveBeenCalledTimes(1);
  });
});
