import { createId } from "./document/id";
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
 * Render a GoTipe document object to an HTML string. A string is not read and rejects with a
 * `TypeError`: parse JSON yourself, `renderToHtml(JSON.parse(json))`.
 * Uses the JS engine and the same public-document conversion as the editor.
 * No browser or WASM binary is required.
 */
export async function renderToHtml(content: object, options?: SSROptions): Promise<string> {
  const editor = await createRenderingEditor(content);

  try {
    const replacements = new Map<string, string>();
    if (options?.blockRenderers) {
      const renderers = options.blockRenderers;
      const replaceCustomBlock = (block: BlockView): BlockView => {
        const renderer = renderers[block.type];
        if (renderer) {
          const marker = `gotipe-ssr-${createId()}`;
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
 * Render a GoTipe document object to a Markdown string; a string rejects, as in `renderToHtml`.
 */
export async function renderToMarkdown(content: object): Promise<string> {
  const editor = await createRenderingEditor(content);
  try {
    return editor.getMarkdown();
  } finally {
    editor.destroy();
  }
}

/**
 * Render a GoTipe document object to plain text; a string rejects, as in `renderToHtml`.
 */
export async function renderToText(content: object): Promise<string> {
  const editor = await createRenderingEditor(content);
  try {
    return editor.getText();
  } finally {
    editor.destroy();
  }
}

async function createRenderingEditor(content: object): Promise<GoTipeEditor> {
  // Only a document object (D-185): a string is HTML only in `content` and `setContent`.
  if (typeof content === "string")
    throw new TypeError("Server rendering takes a document object: pass JSON.parse(json)");
  const { createEditorWithLoader } = await import("./editor");
  return createEditorWithLoader({ extensions: [], content, editable: false, engine: "js" }, null);
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
