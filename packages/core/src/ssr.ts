import type { GoTipeEditor } from "./editor";
import type { Extension } from "./types/extension";
import type { BlockView } from "./types/view";
import { WasmBridge } from "./wasm-bridge";

export interface SSROptions {
  classPrefix?: string;
  inlineStyles?: boolean;
  blockRenderers?: Record<string, (block: BlockView) => string>;
}

/**
 * Render GoTipe document JSON to HTML string.
 * Works in Node.js via WASM — no browser required.
 */
export async function renderToHtml(
  content: object | string,
  options?: SSROptions,
): Promise<string> {
  const bridge = new WasmBridge();
  await bridge.init();

  const doc = typeof content === "string" ? JSON.parse(content) : content;
  bridge.create(JSON.stringify({ nodes: [], marks: [] }), JSON.stringify(doc));

  try {
    let html = bridge.exportHtml();

    if (options?.blockRenderers) {
      const state = JSON.parse(bridge.getState());
      for (const block of state.blocks ?? []) {
        const renderer = options.blockRenderers[block.type];
        if (renderer) {
          const customHtml = renderer(block);
          html = html.replace(
            new RegExp(`data-block-id="${block.id}"[^>]*>[\\s\\S]*?<\\/[^>]+>`),
            `data-block-id="${block.id}">${customHtml}</div>`,
          );
        }
      }
    }

    return html;
  } finally {
    bridge.destroy();
  }
}

/**
 * Render GoTipe document to Markdown string.
 */
export async function renderToMarkdown(content: object | string): Promise<string> {
  const bridge = new WasmBridge();
  await bridge.init();

  const doc = typeof content === "string" ? JSON.parse(content) : content;
  bridge.create(JSON.stringify({ nodes: [], marks: [] }), JSON.stringify(doc));

  try {
    return bridge.exportMarkdown();
  } finally {
    bridge.destroy();
  }
}

/**
 * Render GoTipe document to plain text.
 */
export async function renderToText(content: object | string): Promise<string> {
  const bridge = new WasmBridge();
  await bridge.init();

  const doc = typeof content === "string" ? JSON.parse(content) : content;
  bridge.create(JSON.stringify({ nodes: [], marks: [] }), JSON.stringify(doc));

  try {
    const state = JSON.parse(bridge.getState());
    return (state.blocks ?? [])
      .map((b: BlockView) =>
        Array.isArray(b.content) ? b.content.map((s) => s.text).join("") : (b.content ?? ""),
      )
      .join("\n");
  } finally {
    bridge.destroy();
  }
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
