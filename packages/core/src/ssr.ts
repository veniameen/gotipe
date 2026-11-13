import { blocksToHtml } from "./serialization/html";
import type { GoTipeEditor } from "./types/editor";
import type { Extension } from "./types/extension";
import type { BlockView } from "./types/view";

export interface SSROptions {
  classPrefix?: string;
  inlineStyles?: boolean;
  /** The same as `inlineStyles`, as accepted by `exportToHtml`. */
  includeStyles?: boolean;
  blockRenderers?: Record<string, (block: BlockView) => string>;
}

/**
 * Render GoTipe document JSON to HTML string.
 * Uses the JS engine and the same public-document conversion as the editor.
 * No browser or WASM binary is required.
 */
export async function renderToHtml(
  content: object | string,
  options?: SSROptions,
): Promise<string> {
  const editor = await createRenderingEditor(content);

  try {
    const replacements = new Map<string, string>();
    if (options?.blockRenderers) {
      const renderers = options.blockRenderers;
      const replaceCustomBlock = (block: BlockView): BlockView => {
        const renderer = renderers[block.type];
        if (renderer) {
          const marker = `gotipe-ssr-${crypto.randomUUID()}`;
          const placeholder: BlockView = {
            ...block,
            type: "paragraph",
            content: [{ text: marker, marks: [] }],
            children: [],
          };
          replacements.set(blocksToHtml([placeholder], options), renderer(block));
          return placeholder;
        }
        return { ...block, children: block.children.map(replaceCustomBlock) };
      };
      editor.setContent({
        version: 1,
        blocks: editor.getViewState().blocks.map(replaceCustomBlock),
      });
    }
    let html = blocksToHtml(editor.getViewState().blocks, options);
    for (const [marker, rendered] of replacements) html = html.split(marker).join(rendered);
    return html;
  } finally {
    editor.destroy();
  }
}

/**
 * Render GoTipe document to Markdown string.
 */
export async function renderToMarkdown(content: object | string): Promise<string> {
  const editor = await createRenderingEditor(content);
  try {
    return editor.getMarkdown();
  } finally {
    editor.destroy();
  }
}

/**
 * Render GoTipe document to plain text.
 */
export async function renderToText(content: object | string): Promise<string> {
  const editor = await createRenderingEditor(content);
  try {
    return editor.getText();
  } finally {
    editor.destroy();
  }
}

async function createRenderingEditor(content: object | string): Promise<GoTipeEditor> {
  const { createEditorWithLoader } = await import("./editor");
  const doc = typeof content === "string" ? JSON.parse(content) : content;
  return createEditorWithLoader(
    { extensions: [], content: doc, editable: false, engine: "js" },
    null,
  );
}

/**
 * Create a headless editor instance (no DOM, full API).
 */
export async function createHeadlessEditor(options: {
  extensions: Extension[];
}): Promise<GoTipeEditor> {
  const { createEditorWithLoader } = await import("./editor");
  // Headless editors never need the WASM engine.
  return createEditorWithLoader({ ...options, editable: false, engine: "js" }, null);
}
