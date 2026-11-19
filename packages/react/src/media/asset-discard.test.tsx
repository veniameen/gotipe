// @vitest-environment jsdom
import { type EditorHost, type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { FullPreset } from "@gotipe/core/presets";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaBlocksContext } from "../content/media-blocks";
import { EditorContent } from "../editor-content";
import { mediaBlocks } from "./index";
import { useAssetUpload } from "./use-asset-upload";

type Asset = Parameters<NonNullable<EditorHost["discardAsset"]>>[0];
const BLOCKS = [
  { id: "empty", type: "image", attrs: { src: "" }, content: null, children: [] },
  { id: "attach", type: "file", attrs: { url: "", name: "" }, content: null, children: [] },
  { id: "p", type: "paragraph", attrs: {}, content: [], children: [] },
];

let editor: GoTipeEditor;
let container: HTMLDivElement;
let root: Root;
let pending: Array<(asset: { src: string }) => void>;
let discarded: Asset[];

async function mount(stores = true) {
  pending = [];
  discarded = [];
  const host: EditorHost = {
    discardAsset: (asset) => discarded.push(asset),
    saveAsset: stores
      ? () =>
          new Promise((resolve) => {
            pending.push(resolve);
          })
      : undefined,
  };
  editor = await createEditor({
    extensions: [FullPreset],
    host,
    content: { version: 1, blocks: BLOCKS },
  });
  act(() =>
    root.render(
      <MediaBlocksContext.Provider value={mediaBlocks}>
        <EditorContent editor={editor} />
      </MediaBlocksContext.Provider>,
    ),
  );
}

const flush = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
const block = (id: string) => container.querySelector(`[data-block-id=${id}]`) as HTMLElement;
const attrs = (id: string) => editor.getJSON().blocks.find((entry) => entry.id === id)?.attrs;
async function drop(id: string, selector: string, name: string) {
  const file = new File([new Uint8Array([1])], name, { type: "image/png" });
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: { files: [file] } });
  act(() => {
    block(id).querySelector(selector)?.dispatchEvent(event);
  });
  await vi.waitFor(() => expect(pending.length).toBeGreaterThan(0));
}
const dropImage = (name = "a.png") => drop("empty", ".gotipe-media-placeholder", name);
async function finish(index: number, src: string) {
  await act(async () => pending[index]!({ src }));
  await flush();
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  editor.destroy();
  container.remove();
});

describe("media uploads the block did not apply go to host.discardAsset", () => {
  it("applies a stored image dropped on the placeholder and drops nothing", async () => {
    await mount();
    await dropImage();
    await finish(0, "assets/a.png");
    expect(attrs("empty")?.src).toBe("assets/a.png");
    expect(discarded).toEqual([]);
  });

  it("drops the file when the block is gone", async () => {
    await mount();
    await drop("attach", ".gotipe-file-placeholder", "doc.png");
    act(() => {
      editor.chain().deleteBlock("attach").run();
    });
    await finish(0, "assets/doc.png");
    expect(discarded).toEqual([{ src: "assets/doc.png", name: "doc.png", kind: "file" }]);
  });

  it("drops the image when the editor became read-only", async () => {
    await mount();
    await dropImage();
    act(() => editor.setEditable(false));
    await finish(0, "assets/a.png");
    expect(attrs("empty")?.src).toBe("");
    expect(discarded).toEqual([{ src: "assets/a.png", name: "a.png", kind: "image" }]);
  });

  it("drops the image when the block's source changed meanwhile", async () => {
    await mount();
    await dropImage();
    act(() => {
      editor.chain().setBlockAttrs("empty", { src: "https://example.test/b.png" }).run();
    });
    await finish(0, "assets/a.png");
    expect(attrs("empty")?.src).toBe("https://example.test/b.png");
    expect(discarded).toEqual([{ src: "assets/a.png", name: "a.png", kind: "image" }]);
  });

  it("drops nothing when the host does not store files", async () => {
    await mount(false);
    const file = new File([new Uint8Array([1])], "a.png", { type: "image/png" });
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: { files: [file] } });
    act(() => {
      block("empty").querySelector(".gotipe-media-placeholder")?.dispatchEvent(event);
      editor.chain().setBlockAttrs("empty", { src: "https://example.test/b.png" }).run();
    });
    await flush();
    expect(attrs("empty")?.src).toBe("https://example.test/b.png");
    expect(discarded).toEqual([]);
  });
});

describe("useAssetUpload", () => {
  function Probe(props: { onReady: (upload: (file: File) => Promise<void>) => void }) {
    const { upload } = useAssetUpload(editor, "empty", "image", (saved) => {
      editor.chain().setBlockAttrs("empty", { src: saved.src }).run();
    });
    props.onReady(upload);
    return null;
  }

  it("drops the save a newer one superseded, and the one an unmounted owner gets", async () => {
    await mount();
    let upload!: (file: File) => Promise<void>;
    const probe = document.createElement("div");
    const probeRoot = createRoot(probe);
    act(() =>
      probeRoot.render(
        <Probe
          onReady={(next) => {
            upload = next;
          }}
        />,
      ),
    );
    const png = (name: string) => new File(["x"], name, { type: "image/png" });
    void act(() => upload(png("old.png")));
    void act(() => upload(png("new.png")));
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    await finish(0, "assets/old.png");
    await finish(1, "assets/new.png");
    expect(attrs("empty")?.src).toBe("assets/new.png");
    expect(discarded).toEqual([{ src: "assets/old.png", name: "old.png", kind: "image" }]);
    void act(() => upload(png("closed.png")));
    await vi.waitFor(() => expect(pending).toHaveLength(3));
    act(() => probeRoot.unmount());
    await finish(2, "assets/closed.png");
    expect(attrs("empty")?.src).toBe("assets/new.png");
    expect(discarded[1]).toEqual({ src: "assets/closed.png", name: "closed.png", kind: "image" });
  });
});
