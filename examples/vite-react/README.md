# GoTipe editor for Vite and React

A Notion-style block editor in a Vite and React project, built with
[GoTipe](https://gotipe.com): the `/` menu, a drag handle, a formatting bubble, tables, to-do
lists, callouts and code, in light and dark.

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/veniameen/gotipe/tree/main/examples/vite-react?file=src%2Feditor.tsx)

## Start

```bash
npx degit veniameen/gotipe/examples/vite-react my-editor
cd my-editor
npm install
npm run dev
```

Open the address Vite prints and type `/` on an empty line.

## What is where

| File | Contents |
|---|---|
| `src/editor.tsx` | The editor, with the welcome document |
| `src/main.tsx` | Renders `<Editor />` |
| `src/styles.css` | Gives the page the editor's background and text colours |

## Keep the document

`<Editor />` takes the document to open and calls `onChange` after every edit:

```tsx
<Editor
  initialContent={savedDocument}
  onChange={(editor) => save(editor.getJSON())}
/>
```

`editor.getJSON()` returns the GoTipe document, `editor.getMarkdown()` returns Markdown and
`editor.getHTML()` returns HTML. `initialContent` takes GoTipe JSON or an HTML string, and is read
once, when the editor is created. See [content formats](https://gotipe.com/docs/concepts/content-formats/).

## Light and dark

The editor follows the operating system. If your app switches themes with a `light` or `dark`
class on `<html>`, as shadcn/ui does, the editor follows that class instead. Colours, fonts and
the four views are covered in [theming](https://gotipe.com/docs/ui/theming/).

## Packages

`@gotipe/block-editor` is the ready UI. It needs `@gotipe/core`, `@gotipe/react`, `@gotipe/theme`,
`@gotipe/i18n`, `@gotipe/markdown`, `@gotipe/suggestions` and `@gotipe/versions`. The editor runs
with `engine: "js"` and needs no WebAssembly. For [collaboration](https://gotipe.com/docs/collaboration/overview/),
which needs the Rust engine, install `@gotipe/wasm`, use `engine: "wasm"` and follow
[the WASM engine](https://gotipe.com/docs/getting-started/installation/#the-wasm-engine) for the
Vite dev server.

## Also with shadcn

The same component installs into an existing project with the shadcn CLI:

```bash
npx shadcn@latest add @gotipe/block-editor
```

## Learn more

- [Block editor](https://gotipe.com/docs/ui/block-editor/): props, views and the page head
- [Quick start](https://gotipe.com/docs/getting-started/quick-start/) and [installation](https://gotipe.com/docs/getting-started/installation/)
- [llms.txt](https://gotipe.com/llms.txt) for coding agents

## License

The code of this starter is MIT. It installs `@gotipe/block-editor` and `@gotipe/theme`, which
are under the GoTipe Commercial License: free for personal projects, non-profits and education,
OSI open-source projects, organisations with under USD 1M revenue in the last 12 months, and
while you evaluate or develop before production. The other GoTipe packages are MIT. See
[licensing](https://gotipe.com/docs/resources/licensing/).
