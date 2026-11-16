// @vitest-environment jsdom
import { type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { FullPreset } from "@gotipe/core/presets";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaBlocksContext } from "../content/media-blocks";
import { EditorContent } from "../editor-content";
import { mediaBlocks } from "./index";

// D-210: one click on the name of a file card opens the file once. The editor's link handler on
// the surface takes any `a[href]`, so the card's own call used to make it twice: when read-only
// and on Cmd/Ctrl+click while editing.
const FILE = "https://example.test/a.pdf";
const INFO = { blockId: "file", newTab: true, target: null };

describe.each([
  ["the read-only view", false],
  ["the media entry", true],
])("a file name in %s opens once (D-210)", (_, withMedia) => {
  let editor: GoTipeEditor;
  let container: HTMLDivElement;
  let root: Root;
  const openLink = vi.fn();
  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    openLink.mockReset();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    editor = await createEditor({
      extensions: [FullPreset],
      host: { openLink },
      content: {
        version: 1,
        blocks: [
          {
            id: "file",
            type: "file",
            attrs: { url: FILE, name: "a.pdf", size: 2048 },
            content: null,
            children: [],
          },
        ],
      },
    });
    const content = <EditorContent editor={editor} />;
    act(() =>
      root.render(
        withMedia ? (
          <MediaBlocksContext.Provider value={mediaBlocks}>{content}</MediaBlocksContext.Provider>
        ) : (
          content
        ),
      ),
    );
  });
  afterEach(() => {
    act(() => root.unmount());
    editor.destroy();
    container.remove();
  });
  const click = (init: MouseEventInit) => {
    const name = container.querySelector("[data-block-id=file] .gotipe-file-card-name");
    expect(name?.getAttribute("href")).toBe(FILE);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, ...init });
    act(() => {
      name?.dispatchEvent(event);
    });
    // The page itself never navigates to the file.
    expect(event.defaultPrevented).toBe(true);
  };

  it("when read-only", () => {
    act(() => editor.setEditable(false));
    click({});
    expect(openLink.mock.calls).toEqual([[FILE, INFO]]);
  });

  it("on Cmd or Ctrl+click while editing, as on a plain click", () => {
    click({ metaKey: true });
    click({ ctrlKey: true });
    click({});
    expect(openLink.mock.calls).toEqual([
      [FILE, INFO],
      [FILE, INFO],
      [FILE, INFO],
    ]);
  });
});
