import { ExportError, toExportError } from "./errors";

/** The optional exporter module is separate from the core editor WASM. */
type ExportModule = typeof import("@gotipe/export-wasm");
let modulePromise: Promise<ExportModule> | undefined;

export function loadExporters(): Promise<ExportModule> {
  if (!modulePromise) {
    modulePromise = import("@gotipe/export-wasm")
      .then(async (module) => {
        await module.default();
        return module;
      })
      .catch((error: unknown) => {
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
