---
title: Installation
description: Which GoTipe packages to install, their peer dependencies, styles and how the WASM engine is loaded.
packages: ["@gotipe/core", "@gotipe/react", "@gotipe/vue", "@gotipe/block-editor", "@gotipe/theme", "@gotipe/wasm"]
---

GoTipe ships as a set of packages. Install the ones for your setup, import the styles if
you use the ready UI, and configure the bundler only if you want the WASM engine.

## Pick your packages

Ready editor for React (`BlockEditor` and `PageEditor`):

```sh
npm install @gotipe/block-editor @gotipe/core @gotipe/react @gotipe/theme @gotipe/i18n @gotipe/markdown @gotipe/suggestions react react-dom
```

Headless editor for React, with your own interface:

```sh
npm install @gotipe/core @gotipe/react react react-dom
```

Headless editor for Vue:

```sh
npm install @gotipe/core @gotipe/vue vue
```

Server rendering, conversion scripts and tests in Node need only the core:

```sh
npm install @gotipe/core
```

Add `@gotipe/wasm` when you want the Rust engine, for example for
[collaboration](/docs/collaboration/overview):

```sh
npm install @gotipe/wasm
```

Every package ships ES modules, CommonJS and TypeScript types; `@gotipe/wasm` and
`@gotipe/export-wasm` are ES modules only. You don't need `@types` packages.

## Peer dependencies

| Package | Peer dependencies |
|---|---|
| `@gotipe/core` | `@gotipe/wasm` (optional) |
| `@gotipe/react` | `@gotipe/core`, `react` ≥ 18, `react-dom` ≥ 18 |
| `@gotipe/vue` | `@gotipe/core`, `vue` ≥ 3.4 |
| `@gotipe/svelte` | `@gotipe/core`, `svelte` ≥ 5 |
| `@gotipe/solid` | `@gotipe/core`, `solid-js` ≥ 1.8 |
| `@gotipe/block-editor` | `@gotipe/core`, `@gotipe/react`, `@gotipe/theme`, `@gotipe/i18n`, `@gotipe/markdown`, `@gotipe/suggestions`, `react` ≥ 18, `react-dom` ≥ 18; `shiki` ^1.22 (optional, code highlighting) |
| `@gotipe/block-editor-vue` | `@gotipe/core`, `@gotipe/vue`, `@gotipe/theme`, `vue` ≥ 3.4 |
| `@gotipe/ai-ui` | `@gotipe/ai`, `@gotipe/core`, `react` ≥ 18, `react-dom` ≥ 18 |
| `@gotipe/export` | `@gotipe/core`; `@gotipe/export-wasm` (optional, PDF and DOCX) |
| `@gotipe/ai`, `@gotipe/collaboration`, `@gotipe/comments`, `@gotipe/suggestions`, `@gotipe/versions`, `@gotipe/i18n`, `@gotipe/migration`, `@gotipe/theme` | `@gotipe/core` |
| `@gotipe/markdown`, `@gotipe/sdk`, `@gotipe/wasm`, `@gotipe/export-wasm` | none |

## Styles

The ready UI draws with two style sheets from `@gotipe/theme`. Import both once, before
your own CSS:

```ts title="main.ts"
import "@gotipe/theme/base.css";
import "@gotipe/theme/theme.css";
```

| File | Contents |
|---|---|
| `@gotipe/theme/base.css` | The document: text, headings, lists, tables, code, in every view |
| `@gotipe/theme/theme.css` | Menus, panels, review cards, loading and error states |
| `@gotipe/theme/page.css` | Both files above in one import |
| `@gotipe/theme/tokens.css` | Only the `--gt-*` design tokens |

The headless adapters ship no CSS. `EditorContent` renders semantic HTML (`p`, `h1`–`h6`,
`ul`, `ol`, `table`, `pre`) inside `.gotipe-content`, with `data-block-id` and
`data-block-type` on every block, so you can style it yourself.

> [!NOTE]
> `@gotipe/theme` is a commercial package. If you use only MIT packages, write your own
> styles for `.gotipe-content`. Colours and sizes are covered in [theming](/docs/ui/theming).

## The WASM engine

`createEditor` from `@gotipe/core` with `engine: "auto"` (the default) or `"wasm"`
imports `@gotipe/wasm` on demand. The module finds its binary with
`new URL("gotipe_wasm_bg.wasm", import.meta.url)` and fetches it, so your bundler must
emit `gotipe_wasm_bg.wasm` as an asset next to the loader.

Vite does this in production builds. In the dev server, exclude the package from
dependency pre-bundling so the URL still points at the real file:

```ts title="vite.config.ts"
import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    exclude: ["@gotipe/wasm"],
  },
});
```

Other things to check:

- Serve `.wasm` files as `application/wasm`. With another type the loader falls back to a
  slower instantiation and logs a warning.
- Under a Content Security Policy the WASM engine needs `'wasm-unsafe-eval'` in
  `script-src`, and `connect-src` must allow the binary's URL. The JS engine needs neither.
  See [security](/docs/resources/security).
- If your bundler can't emit the asset, load the binary yourself; see
  [Engines](/docs/getting-started/engines#loading-the-binary-yourself).

## JS-only builds

`@gotipe/core/js` has the same API as `@gotipe/core` with the JS engine only. Nothing in it
references `@gotipe/wasm`, so the bundle contains no WebAssembly and the editor runs under
`script-src 'self'`. `PageEditor` always uses this entry.

Adapters such as `@gotipe/react` import `@gotipe/core`. To keep WASM out of the whole
bundle, alias the exact specifier; subpaths such as `@gotipe/core/presets` stay as they are:

```ts title="vite.config.ts"
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: [{ find: /^@gotipe\/core$/, replacement: "@gotipe/core/js" }],
  },
});
```

Without `@gotipe/wasm` installed and without the alias, `engine: "auto"` falls back to the
JS engine and logs a warning; pass `engine: "js"` to skip the attempt. A bundler that
fails on the unresolved optional import needs the alias.

## Node

The core runs in Node for server rendering, scripts and tests. `@gotipe/core/server` and
`@gotipe/core/js` use the JS engine and need no DOM. The default WASM loader can't fetch
the binary from disk in Node, so `createEditor` from `@gotipe/core` falls back to JS there
(or rejects with `engine: "wasm"`); to run the Rust engine in Node,
[load the binary yourself](/docs/getting-started/engines#loading-the-binary-yourself).

Pass documents as JSON in Node: HTML import uses the browser's `DOMParser` and throws
`PARSE_ERROR` without it. See [content formats](/docs/concepts/content-formats).

## Next steps

- [Quick start](/docs/getting-started/quick-start)
- [Engines](/docs/getting-started/engines)
- [Security and CSP](/docs/resources/security)
