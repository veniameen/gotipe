# @gotipe/wasm

The Rust document engine of GoTipe, compiled to WebAssembly. `@gotipe/core` loads it when an
editor is created with `engine: "wasm"` or `engine: "auto"` (the default); collaboration runs
only on this engine.

[Docs](https://gotipe.com/docs/getting-started/engines/) · [Website](https://gotipe.com) · [Repository](https://github.com/veniameen/gotipe)

## Install

```sh
npm install @gotipe/core @gotipe/wasm
```

The package has no dependencies. It is an ES module only; you use it through `@gotipe/core`
rather than calling it directly.

## Usage

```ts
import { createEditor } from "@gotipe/core";
import { DefaultPreset } from "@gotipe/core/presets";

const editor = await createEditor({ extensions: [DefaultPreset], engine: "wasm" });
console.log(editor.engine); // "wasm"
```

With `engine: "auto"` the core falls back to the JS engine and logs a warning when the module
can't be loaded; `engine: "wasm"` rejects with `WASM_INIT_FAILED` instead.

In the browser the module finds `gotipe_wasm_bg.wasm` with `new URL(…, import.meta.url)`, so
your bundler must emit the file as an asset. For the Vite dev server, exclude the package from
pre-bundling:

```ts
// vite.config.ts
import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: { exclude: ["@gotipe/wasm"] },
});
```

To load the binary yourself (a CDN, or a bundler that can't emit the asset), pass a loader.
With Vite, for example:

```ts
import { createEditorWithLoader, type WasmModuleLoader } from "@gotipe/core";
import { DefaultPreset } from "@gotipe/core/presets";
import wasmUrl from "@gotipe/wasm/pkg/gotipe_wasm_bg.wasm?url";

const loadWasm: WasmModuleLoader = async () => {
  const wasm = await import("@gotipe/wasm");
  await wasm.default({ module_or_path: wasmUrl });
  return wasm;
};

const editor = await createEditorWithLoader({ extensions: [DefaultPreset], engine: "wasm" }, loadWasm);
```

- Serve `.wasm` files as `application/wasm`.
- Under a Content Security Policy, allow `'wasm-unsafe-eval'` in `script-src` and the binary's
  URL in `connect-src`.
- In Node, the package's `node` export condition reads the binary from the installed package;
  no loader is needed.

## License

MIT. See [LICENSE](https://github.com/veniameen/gotipe/blob/main/packages/wasm/LICENSE). Notices
for the bundled third-party code and data are in
[THIRD_PARTY_NOTICES.md](https://github.com/veniameen/gotipe/blob/main/packages/wasm/THIRD_PARTY_NOTICES.md).
