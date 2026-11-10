import { toWasmDoc } from "../engine/conversion";
import { toWasmSchema } from "../engine/schema";
import { parseHtmlDocument } from "../html";
import { applyPolyfills } from "../polyfills";
import type { CreateEditorOptions } from "../types/editor";
import { type EngineMode, WasmBridge, type WasmModuleLoader } from "../wasm-bridge";
import { buildSchema, resolveExtensions } from "./extensions";

/** Engine/extension creation happens once before a live editor owns events and state. */
export async function initializeEditor(
  options: CreateEditorOptions,
  loader: WasmModuleLoader | null,
) {
  applyPolyfills();

  const engineMode: EngineMode = options.engine ?? "auto";
  const bridge = new WasmBridge(engineMode === "js" ? null : loader, engineMode);
  await bridge.init();

  const resolved = resolveExtensions(options.extensions);
  const schema = buildSchema(resolved);
  const schemaJson = JSON.stringify(toWasmSchema(schema));

  const initialContent =
    options.content != null
      ? typeof options.content === "string"
        ? parseHtmlDocument(options.content)
        : options.content
      : {
          blocks: [
            {
              id: crypto.randomUUID(),
              type: "paragraph",
              attrs: {},
              content: [],
              children: [],
            },
          ],
          version: 1,
        };

  // Convert JS format to Rust WASM format before sending
  const wasmContent = toWasmDoc(initialContent as Record<string, unknown>);

  // Module availability may select JS in init(). Invalid schemas/documents must fail
  // consistently instead of silently accepting the same input in another engine.
  bridge.create(schemaJson, JSON.stringify(wasmContent));

  return { bridge, resolved, schema, schemaJson, initialContent };
}
