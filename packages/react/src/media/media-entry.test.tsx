// @vitest-environment jsdom
import { type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { FullPreset } from "@gotipe/core/presets";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MediaBlocksContext } from "../content/media-blocks";
import { EditorContent } from "../editor-content";
import { mediaBlocks } from "./index";

declare global {
  interface ImportMeta {
    glob(
      pattern: string,
      options: { query: string; import: string; eager: true },
    ): Record<string, string>;
  }
}

// Sources of the package by their path from `src/`, read by Vite at test time (this
// folder's own files come back as `./name`).
const SOURCES = Object.fromEntries(
  Object.entries(
    import.meta.glob("../**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }),
  ).map(([path, source]) => [
    path.startsWith("./") ? `media/${path.slice(2)}` : path.slice(3),
    source,
  ]),
);

function join(from: string, spec: string): string {
  const parts = from.split("/").slice(0, -1);
  for (const part of spec.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== ".") parts.push(part);
  }
  return parts.join("/");
}

/** Every source file the module imports, statically or by a literal dynamic import. */
function graph(entry: string): Set<string> {
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const match of (SOURCES[file] ?? "").matchAll(
      /(?:from|import)\s*\(?\s*"(\.{1,2}\/[^"]+)"/g,
    )) {
      const base = join(file, match[1] as string);
      const next = [".ts", ".tsx", "/index.ts"].map((ext) => base + ext).find((f) => f in SOURCES);
      if (!next) throw new Error(`unresolved ${match[1]} in ${file}`);
      visit(next);
    }
  };
  visit(entry);
  return seen;
}

describe("@gotipe/react/media entry", () => {
  it("is not reachable from the React entry", () => {
    expect(SOURCES["index.ts"]).toBeDefined();
    const files = [...graph("index.ts")];
    const editing = [
      "media/index.ts",
      "media/image-block.tsx",
      "media/file-block.tsx",
      "media/image-insert.tsx",
      "media/image-dialog.tsx",
      "media/image-caption.tsx",
      "media/image-actions-menu.tsx",
      "media/use-asset-upload.ts",
      "media/use-image-resize.ts",
    ];
    expect(files.filter((file) => editing.includes(file))).toEqual([]);
    expect(files).toContain("content/media-view.tsx");
  });
});

describe("media blocks", () => {
  let editor: GoTipeEditor;
  let container: HTMLDivElement;
  let root: Root;
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
          {
            id: "image",
            type: "image",
            attrs: {
              src: "https://example.test/a.png",
              alt: "Alt",
              caption: "Caption",
              width: 320,
            },
            content: null,
            children: [],
          },
          {
            id: "file",
            type: "file",
            attrs: { url: "https://example.test/a.pdf", name: "a.pdf", size: 2048 },
            content: null,
            children: [],
          },
          { id: "empty", type: "image", attrs: { src: "" }, content: null, children: [] },
        ],
      },
    });
  });
  afterEach(() => {
    act(() => root.unmount());
    editor.destroy();
    container.remove();
  });

  it("shows images and files read-only without the media entry", () => {
    act(() => root.render(<EditorContent editor={editor} />));
    const image = container.querySelector("[data-block-id=image]");
    expect(image?.classList.contains("gotipe-image-block")).toBe(true);
    expect(image?.querySelector("img")?.getAttribute("alt")).toBe("Alt");
    expect(image?.querySelector("img")?.style.width).toBe("320px");
    expect(image?.querySelector("figcaption")?.textContent).toBe("Caption");
    expect(image?.querySelector("[contenteditable=true], [data-gotipe-image-toolbar]")).toBeNull();
    expect(image?.querySelector("button")).toBeNull();
    const file = container.querySelector("[data-block-id=file]");
    expect(file?.querySelector(".gotipe-file-card-name")?.textContent).toBe("a.pdf");
    expect(file?.querySelector(".gotipe-file-card-meta")?.textContent).toBe("2.0 KB");
    expect(file?.querySelector("button")).toBeNull();
    const empty = container.querySelector("[data-block-id=empty]");
    expect(empty?.querySelector(".gotipe-media-placeholder-label")?.textContent).toBe(
      "Add an image",
    );
    expect(empty?.querySelector("button")).toBeNull();
  });

  it("draws the editing blocks when the media entry is provided", () => {
    act(() =>
      root.render(
        <MediaBlocksContext.Provider value={mediaBlocks}>
          <EditorContent editor={editor} />
        </MediaBlocksContext.Provider>,
      ),
    );
    const image = container.querySelector("[data-block-id=image]");
    expect(image?.querySelector("[data-gotipe-image-toolbar]")).not.toBeNull();
    expect(
      image?.querySelector('figcaption [role="textbox"]')?.getAttribute("contenteditable"),
    ).toBe("true");
    const file = container.querySelector("[data-block-id=file]");
    expect(file?.querySelectorAll(".gotipe-media-action-btn").length).toBe(2);
    const empty = container.querySelector("[data-block-id=empty]");
    expect(empty?.querySelectorAll(".gotipe-media-button").length).toBe(2);
  });
});
