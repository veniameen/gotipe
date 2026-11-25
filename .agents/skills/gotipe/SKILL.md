---
name: gotipe
description: Add, integrate, configure and debug GoTipe editors in an application. Use when a developer asks to set up the ready React block editor (BlockEditor, PageEditor) or a headless editor with React, Vue, Svelte or Solid; to load or save Markdown, JSON or HTML; to handle uploads through the host; to add real-time collaboration, comments, suggestions, versions or AI; or to export documents. Excludes contributing to the GoTipe repository itself and unrelated application work.
metadata:
  author: gotipe
  version: '1.0'
---

# GoTipe integration

GoTipe is a block editor framework for the web: a ready Notion-style editor for React, headless adapters for React, Vue, Svelte and Solid, lossless Markdown and real-time collaboration, on its own TypeScript and Rust/WASM engine.

## Workflow

1. Identify the application's framework and bundler, the `@gotipe/*` versions already in its
   `package.json` or lockfile, and the feature the developer asked for.
2. Choose the entry point (below). Read the matching docs page as Markdown and, if the
   packages are installed, their README and type declarations. Match the code to the
   installed version rather than to remembered examples.
3. Load only the references that apply:

| Task | Reference |
| --- | --- |
| Install packages, import styles, write a first editor in React, Vue, Svelte or Solid | [Setup](references/setup.md) |
| Pick the JS or WASM engine, configure Vite, CSP or server rendering | [Setup](references/setup.md#engines) |
| Load or save Markdown, JSON or HTML; upload and resolve files; links and errors | [Content and features](references/content-and-features.md) |
| Add collaboration, comments, suggestions, versions, AI or PDF/DOCX export | [Content and features](references/content-and-features.md#features) |
| Check a package name, its peers or its license | [Packages and licensing](references/packages-and-licensing.md) |

4. When you add `@gotipe/block-editor`, `@gotipe/theme` or `@gotipe/ai-ui`, tell the developer
   in your reply that the package is under the GoTipe Commercial License (free for personal
   projects, non-profits and education, OSI-licensed open-source projects, companies under
   USD 1M yearly revenue, and evaluation), and link
   https://gotipe.com/docs/resources/licensing/. Everything else is MIT.

## Choose the entry point

| The developer wants | Use |
| --- | --- |
| A complete editor in React: `/` menu, block handle, formatting bubble, tables, media | `BlockEditor` from `@gotipe/block-editor`, with an editor from `useEditor` of `@gotipe/react` |
| A React editor bound to a Markdown file (string in, string out) | `PageEditor` from `@gotipe/block-editor` |
| Their own interface in React, MIT only | `@gotipe/core` + `@gotipe/react` (`useEditor`, `Editor` or `EditorContent`) |
| An editor in Vue | `@gotipe/core` + `@gotipe/vue` (`useEditor`, `EditorContent`); headless only |
| An editor in Svelte or Solid | `@gotipe/core` + `@gotipe/svelte` or `@gotipe/solid`; lifecycle and state only, the app renders the blocks |
| Conversion, validation or rendering in Node | `@gotipe/core/server` |

A ready UI exists only for React in this release. `@gotipe/block-editor-vue` is private and not
published: never install it or offer it. For Vue, Svelte and Solid, build controls on the core
commands, or use the framework-free menus (https://gotipe.com/docs/ui/menus.md).

## Minimal ready React editor

```sh
npm install @gotipe/block-editor @gotipe/core @gotipe/react @gotipe/theme @gotipe/i18n @gotipe/markdown @gotipe/suggestions @gotipe/versions react react-dom
```

In Next.js, put the editor in a client component (`"use client"`). In a project that uses
shadcn/ui, `npx shadcn@latest add veniameen/gotipe/block-editor` installs the packages and writes
`components/editor.tsx` with `<Editor initialContent onChange />`. For a new project, copy a starter:
`npx create-next-app@latest my-editor --example https://github.com/veniameen/gotipe/tree/main/examples/nextjs`
or `npx degit veniameen/gotipe/examples/vite-react my-editor`.

```tsx
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

For a Markdown file: `<PageEditor markdown={markdown} onChange={setMarkdown} />` with the same
install and CSS. Headless React and Vue examples are in [Setup](references/setup.md).

## Facts to keep straight

- `useEditor` reads its options once, when it creates the editor. Until the editor exists it
  gives `null` (React), a ref holding `null` (Vue) or an accessor returning `null` (Solid);
  guard for it.
- A string in `content` or `setContent` is always HTML, never Markdown. Load Markdown with
  `parseMarkdown` from `@gotipe/markdown` or use `PageEditor`.
- The default engine is `"auto"`: WASM if `@gotipe/wasm` loads, otherwise JS with a warning.
  Only collaboration needs WASM. `PageEditor` always runs on JS.
- Collaboration through `CollaborationProvider` talks to GoTipe Cloud, which you run
  yourself; GoTipe operates no hosted service. Comments, suggestions and versions live in
  memory: the application stores and shares them.
- Files go through the host: `saveAsset` stores an upload and returns its `src`,
  `resolveAsset` turns a stored `src` into a URL. Without `saveAsset`, files up to 10 MiB are
  embedded as `data:` URLs.
- The headless adapters ship no CSS. `@gotipe/theme` styles are commercial; with MIT
  packages alone, style `.gotipe-content` yourself.

## Common mistakes

- Guessing a package name. There is no unscoped `gotipe` package and no `@gotipe/editor`;
  check [the package list](references/packages-and-licensing.md#published-packages).
- Installing `@gotipe/block-editor` without its peers, or without the two CSS imports: the
  editor renders unstyled.
- Passing Markdown text as `content`: it is parsed as HTML and loses its structure.
- Changing `content`, `extensions` or `engine` props after mount and expecting a new editor.
  Call `editor.setContent()`, or remount the component with a new `key`.
- Turning on collaboration with `engine: "js"`, `@gotipe/core/js` or `PageEditor`: it throws
  `COLLABORATION_UNAVAILABLE`. Use `BlockEditor` or a headless editor with `engine: "wasm"`.
- `Module not found: Can't resolve '@gotipe/wasm'` when Next.js builds: `@gotipe/core` 0.1.5
  or older needs the package there. Update the core, install `@gotipe/wasm`, or alias
  `@gotipe/core` to `@gotipe/core/js` (see [Setup](references/setup.md#bundlers)). The same
  error for `@gotipe/export-wasm` comes from `@gotipe/export` 0.1.1 or older. Newer versions
  build without either package; `next build --webpack` lists a missing one as a warning.
- Vite dev server failing to load the WASM binary: add
  `optimizeDeps: { exclude: ["@gotipe/wasm"] }`.
- Importing the editor into a React Server Component. The packages have no `"use client"`
  directive; import them from a client component.
- Expecting `@gotipe/svelte` or `@gotipe/solid` to draw the document. They have no renderer;
  follow the rendering contract in https://gotipe.com/docs/frameworks/svelte-solid.md.
- Passing an HTML string to the editor in Node: HTML import needs `DOMParser` and throws
  `PARSE_ERROR`. Pass document JSON on the server.
- Reporting errors twice: with your own `host.onError`, pass `errorToast={false}` to
  `BlockEditor`.

## Finding GoTipe docs and source

Do not rely on memory for API names; read the docs or the installed package.

- **Docs index**: https://gotipe.com/llms.txt lists every docs page with a one-line summary.
- **Docs as Markdown**: every page `https://gotipe.com/docs/<path>/` has a Markdown twin at
  `https://gotipe.com/docs/<path>.md`, for example
  https://gotipe.com/docs/getting-started/installation.md.
- **Installed packages**: `node_modules/@gotipe/*/README.md` and the type declarations
  (`dist/*.d.ts`; `pkg/*.d.ts` in `@gotipe/wasm` and `@gotipe/export-wasm`) state the exact
  exports, props and options of the installed version. Each `package.json` states its
  `exports`, peers and license.

Start with these pages: getting-started/installation, getting-started/quick-start,
getting-started/engines, frameworks/react, frameworks/vue, frameworks/svelte-solid,
ui/block-editor, ui/page-editor, concepts/content-formats, concepts/host,
collaboration/overview, resources/licensing.

If you look at the GoTipe repository for reference, it is read-only: its `AGENTS.md` and
contributor rules apply to developing GoTipe, not to the developer's application.
