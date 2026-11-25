import { ExportError, toExportError } from "./errors";

/** The optional exporter module is separate from the core editor WASM. */
type ExportModule = typeof import("@gotipe/export-wasm");
let modulePromise: Promise<ExportModule> | undefined;

export function loadExporters(): Promise<ExportModule> {
  if (!modulePromise) {
    modulePromise = (async () => {
      const module = await importExporterPackage();
      await module.default();
      return module;
    })().catch((error: unknown) => {
      modulePromise = undefined;
      throw new ExportError(
        "EXPORTER_UNAVAILABLE",
        "Could not load optional PDF/DOCX exporters. Install @gotipe/export-wasm and serve its WASM asset.",
        { cause: error },
      );
    });
  }
  return modulePromise;
}

/**
 * `@gotipe/export-wasm` is an optional peer. webpack and Turbopack, the bundlers of Next.js,
 * treat an import written directly inside a `try` block as optional, so an app that exports
 * only HTML and Markdown builds without the package. Keep the literal `import()` in this block:
 * guarded by `.catch()` instead, or moved into a callback, it fails those builds with
 * "Module not found: Can't resolve '@gotipe/export-wasm'", and a specifier in a variable hides
 * the package from bundlers. `pnpm check:packages` holds the packed files to this rule.
 */
async function importExporterPackage(): Promise<ExportModule> {
  try {
    return await import("@gotipe/export-wasm");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`@gotipe/export-wasm could not be imported (${reason})`, { cause: error });
  }
}

/**
 * Run one exporter call. Failures become `ExportError`; the bytes are returned as an
 * `ArrayBuffer`-backed array, which `Blob`, `File` and `Response` accept as is.
 */
export function exportBytes(render: () => Uint8Array): Uint8Array<ArrayBuffer> {
  let bytes: Uint8Array;
  try {
    bytes = render();
  } catch (error) {
    throw toExportError(error);
  }
  return bytes.buffer instanceof ArrayBuffer
    ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    : new Uint8Array(bytes);
}
