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
        throw new Error(
          "Could not load optional PDF/DOCX exporters. Install @gotipe/export-wasm and serve its WASM asset.",
          { cause: error },
        );
      });
  }
  return modulePromise;
}
