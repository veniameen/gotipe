// @vitest-environment jsdom
import { type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { FullPreset } from "@gotipe/core/presets";
import { act, useRef } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaBlocksContext } from "../content/media-blocks";
import { EditorContent } from "../editor-content";
import { mediaBlocks } from "./index";
import { useImageResize } from "./use-image-resize";

// An SVG with a viewBox and no width or height: no natural width of its own.
const SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 100'%3E%3C/svg%3E";

let editor: GoTipeEditor;
let container: HTMLDivElement;
let root: Root;
/** The laid-out width jsdom lacks: of the column, and of the picture in it. */
let pictureWidth = 0;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  pictureWidth = 0;
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(640);
  vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
  vi.spyOn(HTMLImageElement.prototype, "currentSrc", "get").mockImplementation(function (
    this: HTMLImageElement,
  ) {
    return this.src;
  });
  vi.spyOn(HTMLImageElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ width: pictureWidth, height: pictureWidth / 2 }) as DOMRect,
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  editor = await createEditor({
    extensions: [FullPreset],
    content: {
      version: 1,
      blocks: [{ id: "svg", type: "image", attrs: { src: SVG }, content: null, children: [] }],
    },
  });
});
afterEach(() => {
  act(() => root.unmount());
  editor.destroy();
  container.remove();
  vi.restoreAllMocks();
});

const shell = () => container.querySelector("[data-block-id=svg] .gotipe-image-loaded-shell");

describe("an image without a natural width (D-86)", () => {
  it.each([
    ["read-only", false],
    ["editable", true],
  ])("fills the column instead of collapsing to 0 px (%s)", (_name, editable) => {
    act(() =>
      root.render(
        editable ? (
          <MediaBlocksContext.Provider value={mediaBlocks}>
            <EditorContent editor={editor} />
          </MediaBlocksContext.Provider>
        ) : (
          <EditorContent editor={editor} />
        ),
      ),
    );
    expect(shell()?.getAttribute("data-natural-width")).toBe("none");
  });

  it("leaves a picture with its own width and a resized one as they are", () => {
    pictureWidth = 200;
    act(() => root.render(<EditorContent editor={editor} />));
    expect(shell()?.hasAttribute("data-natural-width")).toBe(false);
    act(() => root.unmount());
    root = createRoot(container);
    pictureWidth = 0;
    act(() => editor.chain().setBlockAttrs("svg", { width: 300 }).run());
    act(() => root.render(<EditorContent editor={editor} />));
    expect(shell()?.hasAttribute("data-natural-width")).toBe(false);
    expect(shell()?.querySelector("img")?.style.width).toBe("300px");
  });
});

describe("Original size", () => {
  function Probe({
    naturalWidth,
    onReady,
  }: { naturalWidth: number; onReady: (f: () => void) => void }) {
    const image = useRef<HTMLImageElement | null>(null);
    const shellRef = useRef<HTMLDivElement | null>(null);
    const { original } = useImageResize(editor, "svg", image, shellRef, false);
    onReady(original);
    return (
      <div>
        <div ref={shellRef}>
          <img
            alt=""
            ref={(element) => {
              image.current = element;
              if (element)
                Object.defineProperty(element, "naturalWidth", {
                  value: naturalWidth,
                  configurable: true,
                });
            }}
          />
        </div>
      </div>
    );
  }
  const widthAfterOriginal = (naturalWidth: number) => {
    let original = () => {};
    act(() =>
      root.render(
        <Probe
          naturalWidth={naturalWidth}
          onReady={(f) => {
            original = f;
          }}
        />,
      ),
    );
    act(() => original());
    return editor.getJSON().blocks[0]!.attrs.width;
  };

  it("takes the column for a picture without a size, its own width otherwise", () => {
    expect(widthAfterOriginal(0)).toBe(640);
    expect(widthAfterOriginal(300)).toBe(300);
    expect(widthAfterOriginal(2400)).toBe(640);
  });
});
