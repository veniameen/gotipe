import { afterEach, describe, expect, it, vi } from "vitest";
import { Image, Paragraph } from "../src/extensions";
import type { EditorHost, GoTipeEditor } from "../src/types/editor";
import { ENGINES, createOn, doc, paragraph } from "./engines";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const clean of cleanups.splice(0)) clean();
});

type Asset = Parameters<NonNullable<EditorHost["discardAsset"]>>[0];
const png = (name: string, body = "x") => new File([body], name, { type: "image/png" });

describe.each(ENGINES)("stored files a paste rule did not insert (%s)", (engine) => {
  async function setup(image = Image) {
    const errors: { code: string; message: string }[] = [];
    const discarded: Asset[] = [];
    const pending: Array<(asset: { src: string }) => void> = [];
    const editor: GoTipeEditor = await createOn(engine, {
      extensions: [Paragraph, image],
      content: doc(paragraph("p", "base")),
      host: {
        onError: (error) => errors.push(error),
        saveAsset: (file) =>
          file.size === 4
            ? Promise.reject(new Error("too big"))
            : new Promise((resolve) => {
                pending.push(resolve);
              }),
        discardAsset: (asset) => discarded.push(asset),
      },
    });
    const root = document.createElement("div");
    root.innerHTML = '<p data-block-id="p" data-block-type="paragraph">base</p>';
    document.body.append(root);
    editor.mount(root);
    const caret = (offset: number) =>
      editor.setSelection({ anchor: { blockId: "p", offset }, head: { blockId: "p", offset } });
    caret(4);
    cleanups.push(() => {
      editor.destroy();
      root.remove();
    });
    const send = (type: "paste" | "drop", files: File[]) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      const data = { files, types: ["Files"], getData: () => "" };
      Object.defineProperty(event, type === "paste" ? "clipboardData" : "dataTransfer", {
        value: data,
      });
      root.dispatchEvent(event);
    };
    const saved = (count: number) => vi.waitFor(() => expect(pending).toHaveLength(count));
    const images = () => editor.getJSON().blocks.filter((block) => block.type === "image");
    return { editor, errors, discarded, pending, send, saved, caret, images };
  }
  const asset = (name: string): Asset => ({ src: `assets/${name}`, name, kind: "image" });

  it("inserts a stored image and drops nothing", async () => {
    const { send, pending, saved, images, discarded, errors } = await setup();
    send("paste", [png("one.png")]);
    await saved(1);
    pending[0]!({ src: "assets/one.png" });
    await vi.waitFor(() => expect(images()).toHaveLength(1));
    expect(discarded).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("keeps a source the document shows: the host may return the same src for the same file", async () => {
    const { send, pending, saved, images, discarded, caret, editor } = await setup();
    send("paste", [png("image.png")]);
    await saved(1);
    pending[0]!({ src: "assets/image.png" });
    await vi.waitFor(() => expect(images()).toHaveLength(1));
    // the same screenshot again, and typing while it is stored: this paste is dropped
    caret(0);
    send("paste", [png("image.png")]);
    await saved(2);
    editor.chain().insertText("x").run();
    pending[1]!({ src: "assets/image.png" });
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(discarded).toEqual([]);
    expect(images()).toHaveLength(1);
  });

  it("drops the image of a paste a newer one replaced, without an error", async () => {
    const { send, pending, saved, images, discarded, errors } = await setup();
    send("paste", [png("first.png")]);
    await saved(1);
    send("drop", [png("second.png")]);
    await saved(2);
    pending[0]!({ src: "assets/first.png" });
    await vi.waitFor(() => expect(discarded).toEqual([asset("first.png")]));
    pending[1]!({ src: "assets/second.png" });
    await vi.waitFor(() => expect(images()).toHaveLength(1));
    expect(images()[0]!.attrs.src).toBe("assets/second.png");
    expect(errors).toEqual([]);
  });

  it("reports a changed document as a failed save and drops the image", async () => {
    const { editor, send, pending, saved, images, discarded, errors } = await setup();
    send("drop", [png("late.png")]);
    await saved(1);
    editor.chain().insertText("!").run();
    pending[0]!({ src: "assets/late.png" });
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(errors[0]).toMatchObject({ code: "ASSET_SAVE_FAILED" });
    expect(discarded).toEqual([asset("late.png")]);
    expect(images()).toEqual([]);
  });

  it("drops the image when the editor became read-only or was destroyed", async () => {
    const { editor, send, pending, saved, images, discarded, errors } = await setup();
    send("paste", [png("locked.png")]);
    await saved(1);
    editor.setEditable(false);
    pending[0]!({ src: "assets/locked.png" });
    await vi.waitFor(() => expect(discarded).toEqual([asset("locked.png")]));
    expect(images()).toEqual([]);
    editor.setEditable(true);
    send("paste", [png("gone.png")]);
    await saved(2);
    editor.destroy();
    pending[1]!({ src: "assets/gone.png" });
    await vi.waitFor(() => expect(discarded).toHaveLength(2));
    expect(discarded[1]).toEqual(asset("gone.png"));
    expect(errors).toEqual([]);
  });

  it("drops the stored images when another file of the paste fails", async () => {
    const { send, pending, saved, images, discarded, errors } = await setup(
      Image.configure({ maxSize: 3 }),
    );
    // the rule refuses the second file after the first one is stored
    send("paste", [png("ok.png"), png("large.png", "abcdef")]);
    await saved(1);
    pending[0]!({ src: "assets/ok.png" });
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(errors[0]).toMatchObject({ code: "ASSET_TOO_LARGE" });
    expect(discarded).toEqual([asset("ok.png")]);
    expect(images()).toEqual([]);
  });

  it("drops the stored images when the host fails another file", async () => {
    const { send, pending, saved, images, discarded, errors } = await setup();
    send("paste", [png("ok.png"), png("bad.png", "abcd")]);
    await saved(1);
    pending[0]!({ src: "assets/ok.png" });
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(errors[0]).toMatchObject({ code: "ASSET_SAVE_FAILED", message: "too big" });
    expect(discarded).toEqual([asset("ok.png")]);
    expect(images()).toEqual([]);
  });

  it("drops nothing when the host does not store files", async () => {
    let finish!: (src: string) => void;
    const upload = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const { editor, send, discarded, errors, images } = await setup(Image.configure({ upload }));
    send("paste", [png("u.png")]);
    await vi.waitFor(() => expect(upload).toHaveBeenCalled());
    editor.chain().insertText("!").run();
    finish("assets/u.png");
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(images()).toEqual([]);
    expect(discarded).toEqual([]);
  });
});

describe.each(ENGINES)("a host object's saveAsset keeps its this (%s)", (engine) => {
  it("stores and inserts a pasted image through a class host", async () => {
    class Store {
      prefix = "assets/";
      async saveAsset(_file: Blob, info: { name: string }) {
        return { src: this.prefix + info.name };
      }
    }
    const editor: GoTipeEditor = await createOn(engine, {
      extensions: [Paragraph, Image],
      content: doc(paragraph("p", "base")),
      host: new Store() as unknown as EditorHost,
    });
    const root = document.createElement("div");
    root.innerHTML = '<p data-block-id="p" data-block-type="paragraph">base</p>';
    document.body.append(root);
    editor.mount(root);
    editor.setSelection({ anchor: { blockId: "p", offset: 4 }, head: { blockId: "p", offset: 4 } });
    cleanups.push(() => {
      editor.destroy();
      root.remove();
    });
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { files: [png("shot.png")], types: ["Files"], getData: () => "" },
    });
    root.dispatchEvent(event);
    await vi.waitFor(() =>
      expect(editor.getJSON().blocks.some((block) => block.attrs.src === "assets/shot.png")).toBe(
        true,
      ),
    );
  });
});
