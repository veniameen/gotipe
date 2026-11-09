import type { WasmModuleLike, WasmModuleLoader } from "./wasm-bridge";

let cached: Promise<WasmModuleLike> | null = null;

/**
 * Default loader for the `@gotipe/wasm` engine. Lives in its own module so that
 * the JS-only entry (`@gotipe/core/js`) has no reference to `@gotipe/wasm`.
 */
export const loadWasmModule: WasmModuleLoader = () => {
  if (!cached) {
    cached = (async () => {
      const mod = await import("@gotipe/wasm");
      await mod.default();
      return mod as unknown as WasmModuleLike;
    })();
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
};
