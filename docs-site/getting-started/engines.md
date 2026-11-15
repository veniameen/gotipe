---
title: Engines
description: The JS and WASM document engines, how GoTipe picks one, what needs WebAssembly and how the binary is loaded.
packages: ["@gotipe/core", "@gotipe/wasm"]
license: MIT
---

The engine holds the document, applies transactions and checks them against the schema.
GoTipe has two implementations of one contract: a TypeScript engine inside `@gotipe/core`
and a Rust engine compiled to WebAssembly in `@gotipe/wasm`. Both take the same document
JSON and steps, count offsets in UTF-16 code units and use the same error codes, so you
switch engines without changing your code. The few behavioural differences in this
release are listed under [known differences](#known-differences).

## Choose an engine

```ts title="editor.ts"
import { createEditor } from "@gotipe/core";
import { DefaultPreset } from "@gotipe/core/presets";

const editor = await createEditor({ extensions: [DefaultPreset], engine: "auto" });
console.log(editor.engine); // "wasm" or "js"
```

| Value | Behaviour |
|---|---|
| `"auto"` (default) | Loads the WASM engine. If the module can't be loaded, uses the JS engine and logs a warning. |
| `"js"` | Uses the JS engine and never loads WebAssembly. |
| `"wasm"` | Loads the WASM engine or rejects with `WASM_INIT_FAILED`. |

`"auto"` falls back only when the module fails to load. An invalid schema or document
fails with the same `VALIDATION_ERROR` in both engines; the editor does not retry it in
the other one.

## Entry points

| Entry | Engines | References `@gotipe/wasm` |
|---|---|---|
| `@gotipe/core` | `auto`, `js`, `wasm` | Yes, through a dynamic import |
| `@gotipe/core/js` | `js` only; `engine: "wasm"` rejects with `WASM_INIT_FAILED` | No |
| `@gotipe/core/server` | `js` only | No |

`@gotipe/core/js` exports the same API as `@gotipe/core`. Use it, or alias `@gotipe/core`
to it, for a bundle without WebAssembly and a CSP without `'wasm-unsafe-eval'`; see
[installation](/docs/getting-started/installation#js-only-builds). `PageEditor` always
runs on the JS engine.

## What needs WebAssembly

Only collaboration. `enableCollaboration`, `getCollaborationUpdate`,
`receiveCollaborationUpdate` and the providers in `@gotipe/collaboration` run on the Rust
CRDT; on the JS engine they throw `COLLABORATION_UNAVAILABLE`. Create collaborative
editors with `engine: "wasm"`, so a missing module fails when the editor is created rather
than later.

Editing, commands, history, Markdown, comments, suggestions, versions, AI and export work
on both engines. PDF and DOCX export load their own module, `@gotipe/export-wasm`, which
does not depend on the editor engine.

How the WASM engine runs a transaction: the TypeScript layer stages each transaction and
validates it against the schema, then the Rust engine applies it. Markdown output uses the
same TypeScript serializer for both engines. Undo history is kept by the editor in both;
after `enableCollaboration` the CRDT owns it, so Undo reverts only local changes and keeps
remote ones.

## Loading the binary

The first `createEditor` call that needs WASM imports `@gotipe/wasm`. In the browser the
module locates `gotipe_wasm_bg.wasm` with `new URL(…, import.meta.url)` and fetches it. In
Node, which can't fetch a `file:` URL, the package's `node` export condition reads the
binary from the installed package instead; browser bundles never include that entry. The
module is loaded once per page or process; if loading fails, the next `createEditor` call
tries again.

- Your bundler must emit the `.wasm` file as an asset. Vite does in production builds; for
  its dev server, see [installation](/docs/getting-started/installation#the-wasm-engine).
- Serve it as `application/wasm`.
- Under a Content Security Policy, allow `'wasm-unsafe-eval'` in `script-src` and the
  binary's URL in `connect-src`. See [security](/docs/resources/security).

### Loading the binary yourself

`createEditorWithLoader(options, loader)` takes your own loader instead of the default
one. Use it when the bundler can't emit the asset or when the binary lives on a CDN. With
Vite, for example:

```ts title="editor.ts"
import { createEditorWithLoader, type WasmModuleLoader } from "@gotipe/core";
import { DefaultPreset } from "@gotipe/core/presets";
import wasmUrl from "@gotipe/wasm/pkg/gotipe_wasm_bg.wasm?url";

const loadWasm: WasmModuleLoader = async () => {
  const wasm = await import("@gotipe/wasm");
  await wasm.default({ module_or_path: wasmUrl });
  return wasm;
};

const editor = await createEditorWithLoader(
  { extensions: [DefaultPreset], engine: "wasm" },
  loadWasm,
);
```

Pass `null` as the loader for a JS-only editor.

## Known differences

In this release the engines are known to differ in two places:
- `Document.version` grows with every applied step on WASM and stays as loaded on JS.
  Listen to `update` to detect changes.
- `getJSON()` writes `attrs` keys in sorted order on WASM, so every collaboration peer
  returns the same JSON, and in the order they were set on JS. Compare documents by value,
  not by their JSON string, when the engine may change.

Both engines reject a step for a block that doesn't exist, and nothing of its transaction
applies or enters the undo history:
- `deleteBlock`, `setBlockType`, `setBlockAttrs`, `removeMark` and `deleteText` throw
  `TRANSFORM_ERROR` (`Block not found: …`);
- `insertText` and `addMark` fail schema validation first, with `VALIDATION_ERROR`.

## Sizes

CI fails a build that exceeds these budgets. JavaScript is measured as the summed gzip
size of every file in the import graph. Adapter budgets exclude the core and the framework
itself.

| Part | Budget, gzip |
|---|---|
| Core with the Markdown codec | 125 KiB |
| `@gotipe/react`, on top of the core | 40 KiB |
| `@gotipe/vue`, on top of the core | 8 KiB |
| `gotipe_wasm_bg.wasm` | 325 KiB |

The WASM binary is about 826 KB before compression and 302 KB gzip; the budget leaves about
10% for growth. It comes in addition to the core JavaScript, which still provides the API,
validation and Markdown. Details are in
[performance](/docs/resources/performance).

## Related

- [Installation](/docs/getting-started/installation)
- [Transactions](/docs/concepts/transactions)
- [Collaboration](/docs/collaboration/overview)
