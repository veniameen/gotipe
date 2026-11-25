# Setup and packages

Sources: https://gotipe.com/docs/getting-started/installation.md,
https://gotipe.com/docs/getting-started/quick-start.md,
https://gotipe.com/docs/getting-started/engines.md and the framework pages under
https://gotipe.com/docs/frameworks/.

## Install

Every package ships ES modules, CommonJS and TypeScript types (`@gotipe/wasm` and
`@gotipe/export-wasm` are ES modules only). No `@types` packages are needed.

| Case | Command | Styles |
| --- | --- | --- |
| Ready React UI (`BlockEditor`, `PageEditor`) | `npm install @gotipe/block-editor @gotipe/core @gotipe/react @gotipe/theme @gotipe/i18n @gotipe/markdown @gotipe/suggestions @gotipe/versions react react-dom` | `@gotipe/theme/base.css` and `@gotipe/theme/theme.css` |
| Headless React | `npm install @gotipe/core @gotipe/react react react-dom` | none shipped |
| Vue | `npm install @gotipe/core @gotipe/vue vue` | none shipped |
| Svelte | `npm install @gotipe/core @gotipe/svelte svelte` | none shipped |
| Solid | `npm install @gotipe/core @gotipe/solid solid-js` | none shipped |
| Node: server rendering, scripts, tests | `npm install @gotipe/core` | — |
| The Rust engine (needed for collaboration), and any Next.js app | add `npm install @gotipe/wasm` | — |
| Code highlighting in the ready UI | add `shiki` (^1.22), optional peer of `@gotipe/block-editor` | — |

Framework versions: React 18 or newer, Vue 3.4 or newer, Svelte 5 or newer, Solid 1.8 or
newer. Use the developer's package manager (`pnpm add`, `yarn add`, `bun add`) with the same
package list.

Next.js resolves `@gotipe/core`'s optional import of `@gotipe/wasm` when it builds (Turbopack
and webpack) and fails without the package; install it, or use the alias under
[Bundlers](#bundlers). With `engine: "js"` the page never downloads the binary.

### Starter projects and shadcn/ui

| Case | Command |
| --- | --- |
| New Next.js app with the ready editor | `npx create-next-app@latest my-editor --example https://github.com/veniameen/gotipe/tree/main/examples/nextjs` |
| New Vite and React app with the ready editor | `npx degit veniameen/gotipe/examples/vite-react my-editor` |
| Existing project with shadcn/ui (`components.json`) | `npx shadcn@latest add veniameen/gotipe/block-editor` |

The shadcn item installs the eight packages of the ready UI and `@gotipe/wasm`, and writes
`components/editor.tsx`: a client component `Editor` with `initialContent` (GoTipe JSON or
HTML) and `onChange(editor)`, which follows a `light` or `dark` class on `<html>`.

### Styles of the ready UI

Import both files once, before the application's own CSS:

```ts
import "@gotipe/theme/base.css"; // the document: text, headings, lists, tables, code
import "@gotipe/theme/theme.css"; // menus, panels, review cards, loading and error states
```

`import "@gotipe/block-editor/styles"` loads the same two files. `@gotipe/theme/page.css` is
both in one file; `@gotipe/theme/tokens.css` holds only the `--gt-*` tokens. Change colours
and sizes by overriding `--gt-*` tokens (https://gotipe.com/docs/ui/theming.md). The views are
`view="notion" | "docs" | "modern" | "minimal"` on `BlockEditor` and `PageEditor`.

The headless adapters ship no CSS. `EditorContent` renders semantic HTML inside
`.gotipe-content`, with `data-block-id` and `data-block-type` on every block. `@gotipe/theme`
is commercial, so an MIT-only setup writes its own styles.

## Examples

All of these run on the JS engine and need no WebAssembly setup.

### Ready React editor

```tsx title="Editor.tsx"
import "@gotipe/theme/base.css";
import "@gotipe/theme/theme.css";
import { BlockEditor } from "@gotipe/block-editor";
import { FullPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/react";

export function Editor() {
  const editor = useEditor({
    extensions: [FullPreset],
    content: "<p>Type / to insert a block.</p>",
    engine: "js",
    onUpdate: ({ editor }) => localStorage.setItem("doc", JSON.stringify(editor.getJSON())),
  });
  return <BlockEditor editor={editor} showAiCommandBar={false} />;
}
```

`BlockEditor` shows a loading skeleton while `editor` is `null`. It has no read-only prop:
create the editor with `editable: false` or call `editor.setEditable(false)`. Other props
(`view`, `header` with `PageHead`, `highlight`, `showSlashMenu`, `showBlockToolbar`,
`showBubbleMenu`, `errorToast`, `media`, …) are in https://gotipe.com/docs/ui/block-editor.md.

### Markdown file in React

```tsx title="Page.tsx"
import "@gotipe/theme/base.css";
import "@gotipe/theme/theme.css";
import { PageEditor } from "@gotipe/block-editor";
import { useState } from "react";

export function Page() {
  const [markdown, setMarkdown] = useState("# Release notes\n\nStart writing.\n");
  return <PageEditor markdown={markdown} onChange={setMarkdown} />;
}
```

`PageEditor` creates its own editor. `onChange` receives the whole file at most once per
animation frame; debounce saving, and call `ref.current.flush()` (type `PageEditorHandle`)
before a save. Untouched blocks keep their original bytes. Its extensions are fixed
(`pageExtensions()`); toggles, columns, embeds and math are not among them. Props such as
`host`, `readOnly`, `locale`, `titlePlaceholder` and `review` are in
https://gotipe.com/docs/ui/page-editor.md.

### Headless React

```tsx title="NotesEditor.tsx"
import { DefaultPreset } from "@gotipe/core/presets";
import { Editor, useEditor, useEditorState } from "@gotipe/react";

export function NotesEditor() {
  const editor = useEditor({
    extensions: [DefaultPreset],
    content: "<h1>Notes</h1><p>Select a word and press Bold.</p>",
    engine: "js",
  });
  const bold = useEditorState(editor, (state) => state.toolbar.activeMarks.includes("bold"));

  return (
    <div>
      <button
        type="button"
        aria-pressed={bold ?? false}
        disabled={!editor}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor?.chain().focus().toggleBold().run()}
      >
        Bold
      </button>
      <Editor editor={editor} ariaLabel="Notes" />
    </div>
  );
}
```

`onMouseDown` with `preventDefault` keeps the selection in the document. Images and files are
read-only until you wrap the editor in `MediaBlocksContext.Provider` with `mediaBlocks` from
`@gotipe/react/media`. `useEditorStatus(options)` returns `{ editor, error }` to show a
creation failure. Also exported: `EditorContent`, `BubbleMenu`, `FloatingMenu`,
`GoTipeI18nProvider`, `useEditorContext`.

### Headless Vue

```vue title="NotesEditor.vue"
<script setup lang="ts">
import { DefaultPreset } from "@gotipe/core/presets";
import { EditorContent, useEditor, useEditorState } from "@gotipe/vue";

const editor = useEditor({
  extensions: [DefaultPreset],
  content: "<h1>Notes</h1><p>Select a word and press Bold.</p>",
  engine: "js",
});
const bold = useEditorState(editor, (state) => state.toolbar.activeMarks.includes("bold"));

function toggleBold() {
  editor.value?.chain().focus().toggleBold().run();
}
</script>

<template>
  <button type="button" :aria-pressed="bold ?? false" :disabled="!editor" @mousedown.prevent @click="toggleBold">
    Bold
  </button>
  <EditorContent :editor="editor" aria-label="Notes" />
</template>
```

`useEditor` returns a `ShallowRef` that holds `null` until the editor exists; it creates the
editor in `onMounted` and destroys it in `onBeforeUnmount`. `EditorContent` has no menus, code
highlighting, table bars, resize handles or upload UI. `useEditorStatus`, `editorKey` and
`useEditorContext` are also exported.

### Svelte and Solid

`@gotipe/svelte` exports `createEditorState(options)`, a store of `{ editor, state, error }`
with `destroy()`. `@gotipe/solid` exports `useEditor`, `useEditorStatus` and
`useEditorState`. Neither has a renderer component: render `viewState.blocks` yourself, give
every block element `data-block-id` and `data-block-type`, call `editor.mount(element)` and
`editor.unmount()`, and follow the full contract in
https://gotipe.com/docs/frameworks/svelte-solid.md, which has working sketches for both.

## Editor options

`useEditor` in every adapter takes the options of `createEditor` from `@gotipe/core`, plus
`onError` for a failed creation:

| Option | Default | Notes |
| --- | --- | --- |
| `extensions` | required | Presets from `@gotipe/core/presets`: `MinimalPreset`, `DefaultPreset`, `FullPreset` (adds columns, embeds, math, files, superscript, subscript). Single extensions come from `@gotipe/core/extensions`. |
| `content` | one empty paragraph | Document JSON, or an HTML string (browser only). |
| `editable` | `true` | |
| `autofocus` | `false` | `true`, `"start"` or `"end"`. |
| `engine` | `"auto"` | `"auto"`, `"js"` or `"wasm"`. |
| `host` | `{}` | Files, links, errors; see [content and features](content-and-features.md#host). |
| `onCreate`, `onUpdate`, `onSelectionChange`, `onFocus`, `onBlur`, `onDestroy` | — | `({ editor }) => void` |

## Engines

| `engine` | Behaviour |
| --- | --- |
| `"auto"` (default) | Loads the WASM engine from `@gotipe/wasm`; if it cannot load, uses JS and logs a warning. |
| `"js"` | JS engine only; never loads WebAssembly. |
| `"wasm"` | WASM engine, or rejects with `WASM_INIT_FAILED`. |

Both engines follow one contract (same JSON, steps, UTF-16 offsets, error codes). Only
collaboration needs WASM: on JS the collaboration methods throw `COLLABORATION_UNAVAILABLE`.
Editing, Markdown, comments, suggestions, versions, AI and export work on both. Create
collaborative editors with `engine: "wasm"` so a missing module fails at creation.

| Entry | Engines |
| --- | --- |
| `@gotipe/core` | `auto`, `js`, `wasm` (imports `@gotipe/wasm` dynamically) |
| `@gotipe/core/js` | `js` only, no reference to `@gotipe/wasm`; same API |
| `@gotipe/core/server` | `js` only, no DOM needed |

### Bundlers

The WASM module fetches `gotipe_wasm_bg.wasm` with `new URL(…, import.meta.url)`, so the
bundler must emit it as an asset. Vite does in production builds; for the dev server:

```ts title="vite.config.ts"
import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: { exclude: ["@gotipe/wasm"] },
});
```

For a bundle without WebAssembly (and a CSP without `'wasm-unsafe-eval'`), alias the exact
specifier; subpaths such as `@gotipe/core/presets` stay as they are:

```ts title="vite.config.ts"
import { defineConfig } from "vite";

export default defineConfig({
  resolve: { alias: [{ find: /^@gotipe\/core$/, replacement: "@gotipe/core/js" }] },
});
```

A bundler that fails on the unresolved optional `@gotipe/wasm` import needs this alias, or
`@gotipe/wasm` installed. Next.js is one; set the alias for both of its bundlers:

```ts title="next.config.ts"
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { resolveAlias: { "@gotipe/core": "@gotipe/core/js" } },
  webpack(config) {
    config.resolve.alias = { ...config.resolve.alias, "@gotipe/core$": "@gotipe/core/js" };
    return config;
  },
};

export default nextConfig;
```

If the bundler cannot emit the asset, or the binary lives on a CDN, use
`createEditorWithLoader(options, loader)` from `@gotipe/core` (see the engines page).

Other checks: serve `.wasm` as `application/wasm`; under a CSP the WASM engine needs
`'wasm-unsafe-eval'` in `script-src` and the binary's URL in `connect-src`
(https://gotipe.com/docs/resources/security.md).

### Server rendering

- The adapters create the editor after mount, so a server render outputs no document: React
  `Editor` renders nothing, `BlockEditor` its skeleton, Vue an empty `.gotipe-content`, the
  Svelte store stays empty. To serve content as HTML, render it with `renderToHtml` from
  `@gotipe/core/server` and let the client editor replace it.
- The packages carry no `"use client"` directive. In a framework with React Server
  Components, import them from a client component.
- In Node, `@gotipe/core` runs the WASM engine without a custom loader (the `node` export
  condition of `@gotipe/wasm` reads the binary). Pass documents as JSON: HTML import needs
  the browser's `DOMParser`.
