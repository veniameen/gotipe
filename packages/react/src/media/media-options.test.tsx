// @vitest-environment jsdom
import {
  type EditorHost,
  type GoTipeEditor,
  type GoTipeError,
  createEditor,
} from "@gotipe/core/js";
import { FullPreset } from "@gotipe/core/presets";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaBlocksContext } from "../content/media-blocks";
import { EditorContent } from "../editor-content";
import { type MediaOptions, MediaOptionsContext } from "../media-options";
import { mediaBlocks } from "./index";

const BLOCKS = [
  { id: "empty", type: "image", attrs: { src: "" }, content: null, children: [] },
  { id: "attach", type: "file", attrs: { url: "", name: "" }, content: null, children: [] },
  {
    id: "image",
    type: "image",
    attrs: { src: "https://example.test/a.png", alt: "" },
    content: null,
    children: [],
  },
];

let editor: GoTipeEditor;
let container: HTMLDivElement;
let root: Root;
const onError = vi.fn<(error: GoTipeError) => void>();

async function mount(media?: MediaOptions, host: EditorHost = {}) {
  editor = await createEditor({
    extensions: [FullPreset],
    host: { ...host, onError },
    content: { version: 1, blocks: BLOCKS },
  });
  const content = (
    <MediaBlocksContext.Provider value={mediaBlocks}>
      <EditorContent editor={editor} />
    </MediaBlocksContext.Provider>
  );
  act(() =>
    root.render(
      media ? (
        <MediaOptionsContext.Provider value={media}>{content}</MediaOptionsContext.Provider>
      ) : (
        content
      ),
    ),
  );
}

const block = (id: string) => container.querySelector(`[data-block-id=${id}]`) as HTMLElement;
const button = (scope: Element, label: string) =>
  scope.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;
const flush = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
const click = (target: Element) =>
  act(() => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

/** Types an address that is no web address into the link field and submits it. */
function submitWrongAddress(scope: Element, field: string) {
  const input = scope.querySelector(`input[aria-label="${field}"]`) as HTMLInputElement;
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, "picture");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    input.form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  return input;
}

/** Drops a PNG on the empty image: the host's `saveAsset` refuses it. */
async function dropImage() {
  const file = new File([new Uint8Array([1])], "a.png", { type: "image/png" });
  const drop = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(drop, "dataTransfer", { value: { files: [file] } });
  const target = block("empty").querySelector(".gotipe-media-placeholder") as HTMLElement;
  act(() => {
    target.dispatchEvent(drop);
  });
  await flush();
}

const refusingHost: EditorHost = { saveAsset: () => Promise.reject(new Error("Disk full")) };

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  onError.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  editor.destroy();
  container.remove();
});

describe("media options: links", () => {
  it("offers a link on empty image and file blocks by default", async () => {
    await mount();
    expect(button(block("empty"), "Add an image by link")?.textContent).toBe("By link");
    expect(button(block("attach"), "Add a file by link")?.textContent).toBe("By link");
  });

  it("`links: false` leaves only the upload on both blocks", async () => {
    await mount({ links: false });
    for (const id of ["empty", "attach"]) {
      expect(block(id).querySelectorAll(".gotipe-media-button").length).toBe(1);
      expect(block(id).querySelector(".gotipe-media-button")?.classList).toContain("is-primary");
      expect(block(id).textContent).not.toContain("By link");
    }
  });

  it("`links: false` keeps the host's catalogs, without the link tab", async () => {
    const search = vi.fn(async () => []);
    await mount({ links: false }, { imageSources: [{ id: "stock", label: "Stock", search }] });
    const open = button(block("empty"), "Stock");
    expect(open?.textContent).toBe("Stock");
    click(open as HTMLButtonElement);
    expect(block("empty").querySelector('input[aria-label="Image URL"]')).toBeNull();
    expect(block("empty").querySelector('[role="tab"]')).toBeNull();
    expect(block("empty").querySelector('input[aria-label="Search Stock"]')).not.toBeNull();
  });
});

describe("media options: inline errors", () => {
  it("shows a failed upload in the block and reports it by default", async () => {
    await mount(undefined, refusingHost);
    await dropImage();
    expect(block("empty").querySelector(".gotipe-media-insert-error")?.textContent).toBe(
      "Upload failed. Please try again.",
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0].code).toBe("ASSET_SAVE_FAILED");
  });

  it("`inlineErrors: false` shows no text; the failed upload still reaches host.onError", async () => {
    await mount({ inlineErrors: false }, refusingHost);
    await dropImage();
    expect(block("empty").querySelector(".gotipe-media-insert-error, [role=alert]")).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toMatchObject({
      code: "ASSET_SAVE_FAILED",
      message: "Disk full",
    });
  });

  it("names a wrong address in the field by default, without a report", async () => {
    await mount();
    click(button(block("empty"), "Add an image by link") as HTMLButtonElement);
    const input = submitWrongAddress(block("empty"), "Image URL");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.title).toBe("Enter a valid image URL");
    expect(block("empty").querySelector("[role=alert]")?.textContent).toBe(
      "Enter a valid image URL",
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([
    ["empty", "Add an image by link", "Image URL", "Enter a valid image URL"],
    ["attach", "Add a file by link", "File URL", "Enter a valid file URL"],
  ])(
    "`inlineErrors: false` reports a wrong address of %s instead",
    async (id, open, field, text) => {
      await mount({ inlineErrors: false });
      click(button(block(id), open) as HTMLButtonElement);
      const input = submitWrongAddress(block(id), field);
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(input.title).toBe("");
      expect(block(id).querySelector("[role=alert]")).toBeNull();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0]?.[0]).toMatchObject({ code: "LINK_BLOCKED", message: text });
    },
  );

  it.each([
    [undefined, 1],
    [{ inlineErrors: false }, 0],
  ])("a failed copy with %o: reported, shown %i times", async (media, shown) => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });
    try {
      await mount(media);
      click(button(block("image"), "More options") as HTMLButtonElement);
      const copy = [...block("image").querySelectorAll("button")].find(
        (item) => item.textContent === "Copy image URL",
      );
      click(copy as HTMLButtonElement);
      await flush();
      expect(block("image").querySelectorAll(".gotipe-media-action-error").length).toBe(shown);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0]?.[0].code).toBe("CLIPBOARD_FAILED");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("media.placeholder and media.captionName", () => {
  it("draws the empty blocks as blocks with a primary Upload by default", async () => {
    await mount();
    const empty = block("empty").querySelector(".gotipe-media-placeholder")!;
    expect(empty.hasAttribute("data-layout")).toBe(false);
    expect(empty.querySelector(".gotipe-media-placeholder-label")?.textContent).toBe(
      "Add an image",
    );
    expect(empty.querySelector(".gotipe-media-button.is-primary")?.textContent).toBe("Upload");
    // no hint without the option
    expect(block("image").querySelector(".gotipe-image-caption-hint")).toBeNull();
  });

  it('placeholder: "row" draws one row with a secondary “Choose a file…”', async () => {
    await mount({ placeholder: "row" });
    for (const [id, label] of [
      ["empty", "Image"],
      ["attach", "File"],
    ] as const) {
      const empty = block(id).querySelector(".gotipe-media-placeholder")!;
      expect(empty.getAttribute("data-layout")).toBe("row");
      expect(empty.querySelector(".gotipe-media-placeholder-label")?.textContent).toBe(label);
      expect(empty.querySelector(".gotipe-media-button.is-primary")).toBeNull();
      expect(empty.querySelector(".gotipe-media-button")?.textContent).toBe("Choose a file…");
    }
  });

  it("captionName shows the file name where an image has no caption, outside the document", async () => {
    await mount({ captionName: true });
    expect(block("image").querySelector(".gotipe-image-caption-hint")?.textContent).toBe("a.png");
    expect(editor.getJSON().blocks[2]?.attrs.caption ?? "").toBe("");
  });
});
