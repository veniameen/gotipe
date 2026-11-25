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
npm install @gotipe/block-editor @gotipe/core @gotipe/react @gotipe/theme @gotipe/i18n @gotipe/markdown @gotipe/suggestions @gotipe/versions react react-dom
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

Without it, the app builds with every bundler, Next.js included, and the editor runs on the JS
engine; see [JS-only builds](#js-only-builds).

Every package ships ES modules, CommonJS and TypeScript types; `@gotipe/wasm` and
`@gotipe/export-wasm` are ES modules only. You don't need `@types` packages. The entries of a
package share one copy of its code in both formats, so an error raised through
`@gotipe/core/js` or `@gotipe/core/server` is an `instanceof GoTipeError` from `@gotipe/core`.

## Peer dependencies

| Package | Peer dependencies |
|---|---|
| `@gotipe/core` | `@gotipe/wasm` (optional) |
| `@gotipe/react` | `@gotipe/core`, `react` ≥ 18, `react-dom` ≥ 18 |
| `@gotipe/vue` | `@gotipe/core`, `vue` ≥ 3.4 |
| `@gotipe/svelte` | `@gotipe/core`, `svelte` ≥ 5 |
| `@gotipe/solid` | `@gotipe/core`, `solid-js` ≥ 1.8 |
| `@gotipe/block-editor` | `@gotipe/core`, `@gotipe/react`, `@gotipe/theme`, `@gotipe/i18n`, `@gotipe/markdown`, `@gotipe/suggestions`, `@gotipe/versions`, `react` ≥ 18, `react-dom` ≥ 18; `shiki` ^1.22 (optional, code highlighting) |
| `@gotipe/ai-ui` | `@gotipe/ai`, `@gotipe/core`, `@gotipe/react`, `react` ≥ 18, `react-dom` ≥ 18 |
| `@gotipe/export` | `@gotipe/core`; `@gotipe/export-wasm` (optional, PDF and DOCX) |
| `@gotipe/ai`, `@gotipe/collaboration`, `@gotipe/comments`, `@gotipe/suggestions`, `@gotipe/versions`, `@gotipe/migration`, `@gotipe/theme` | `@gotipe/core` |
| `@gotipe/i18n`, `@gotipe/markdown`, `@gotipe/sdk`, `@gotipe/wasm`, `@gotipe/export-wasm` | none |

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
| `@gotipe/theme/tokens.css` | Only the `--gt-*` design tokens |
| `@gotipe/theme/page.css` | Both files above in one import, kept for older imports |

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

In Next.js, set the alias for Turbopack, its default bundler, and for webpack
(`next build --webpack`):

```ts title="next.config.ts"
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: { "@gotipe/core": "@gotipe/core/js" },
  },
  webpack(config) {
    config.resolve.alias = { ...config.resolve.alias, "@gotipe/core$": "@gotipe/core/js" };
    return config;
  },
};

export default nextConfig;
```

Without `@gotipe/wasm` installed and without the alias, `engine: "auto"` falls back to the
JS engine and logs a warning; pass `engine: "js"` to skip the attempt. The app still builds:
the core imports `@gotipe/wasm` inside a `try` block, which webpack and Turbopack treat as an
optional import, and Vite, esbuild and Rolldown build it too. `next build --webpack` lists the
missing package as a warning; the alias removes it.

With `@gotipe/core` 0.1.5 or older, Next.js stops at
`Module not found: Can't resolve '@gotipe/wasm'`. Update the core, install `@gotipe/wasm`
or set the alias.

## Node

The core runs in Node for server rendering, scripts and tests. `@gotipe/core/server` and
`@gotipe/core/js` use the JS engine and need no DOM. `createEditor` from `@gotipe/core`
runs the Rust engine in Node too: the `node` export condition of `@gotipe/wasm` reads the
binary from the installed package, so `engine: "auto"` and `engine: "wasm"` need no loader
of your own. See [loading the binary](/docs/getting-started/engines#loading-the-binary).

Pass documents as JSON in Node: HTML import uses the browser's `DOMParser` and throws
`PARSE_ERROR` without it. See [content formats](/docs/concepts/content-formats).

## Starter projects

To begin from a complete project, copy a starter: the ready editor with a welcome document, on
the published packages.

```sh
# Next.js (App Router)
npx create-next-app@latest my-editor --example https://github.com/veniameen/gotipe/tree/main/examples/nextjs

# Vite and React
npx degit veniameen/gotipe/examples/vite-react my-editor
```

In a project that uses shadcn/ui, one command writes the editor component to
`components/editor.tsx` and installs its packages, `@gotipe/wasm` included:

```sh
npx shadcn@latest add veniameen/gotipe/block-editor
```

The same item is served at `https://gotipe.com/r/block-editor.json`, an address older versions of
the shadcn CLI install from too; `https://gotipe.com/r/registry.json` lists the items.

The starters and the component are in
[examples](https://github.com/veniameen/gotipe/tree/main/examples) of the repository.

## Next steps

- [Quick start](/docs/getting-started/quick-start)
- [Engines](/docs/getting-started/engines)
- [Security and CSP](/docs/resources/security)
