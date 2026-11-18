// @vitest-environment jsdom
import { type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { FullPreset } from "@gotipe/core/presets";
import type { MediaOptions } from "@gotipe/react";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { BlockEditor } from "./block-editor";

let container: HTMLDivElement;
let root: Root;
let editor: GoTipeEditor;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  editor = await createEditor({
    extensions: [FullPreset],
    content: {
      version: 1,
      blocks: [
        { id: "image", type: "image", attrs: { src: "" }, content: null, children: [] },
        { id: "file", type: "file", attrs: { url: "", name: "" }, content: null, children: [] },
      ],
    },
  });
});
afterEach(() => {
  act(() => root.unmount());
  editor.destroy();
  container.remove();
});

const byLink = () => container.querySelectorAll('button[aria-label$="by link"]').length;

it.each([
  [undefined, 2],
  [{ links: false }, 0],
] as [MediaOptions | undefined, number][])(
  "BlockEditor's `media` %o reaches the empty media blocks",
  (media, links) => {
    act(() => root.render(<BlockEditor editor={editor} media={media} />));
    expect(container.querySelectorAll(".gotipe-media-placeholder").length).toBe(2);
    expect(byLink()).toBe(links);
  },
);
