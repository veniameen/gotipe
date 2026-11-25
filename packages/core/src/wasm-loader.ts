import type { WasmModuleLike, WasmModuleLoader } from "./wasm-bridge";

type EnginePackage = typeof import("@gotipe/wasm");

let cached: Promise<WasmModuleLike> | null = null;

/**
 * Default loader for the `@gotipe/wasm` engine. Lives in its own module so that
 * the JS-only entry (`@gotipe/core/js`) has no reference to `@gotipe/wasm`.
 */
export const loadWasmModule: WasmModuleLoader = () => {
  if (!cached) {
    cached = (async () => {
      const mod = await importEnginePackage();
      await mod.default();
      return mod as unknown as WasmModuleLike;
    })();
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
};

/**
 * `@gotipe/wasm` is an optional peer. webpack and Turbopack, the bundlers of Next.js, treat an
 * import written directly inside a `try` block as optional, so an app without the package
 * builds and `engine: "auto"` falls back to the JS engine. Keep the literal `import()` in this
 * block: guarded by `.catch()` instead, or moved into a callback, it fails those builds with
 * "Module not found: Can't resolve '@gotipe/wasm'", and a specifier in a variable hides the
 * package from bundlers. `pnpm check:packages` holds the packed files to this rule.
 */
async function importEnginePackage(): Promise<EnginePackage> {
  try {
    return await import("@gotipe/wasm");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `@gotipe/wasm could not be loaded (${reason}). Install @gotipe/wasm for the Rust engine, or pass engine: "js".`,
      { cause: error },
    );
  }
}
