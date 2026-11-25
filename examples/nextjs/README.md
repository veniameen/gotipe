# GoTipe editor for Next.js

A Notion-style block editor in a Next.js App Router project, built with
[GoTipe](https://gotipe.com): the `/` menu, a drag handle, a formatting bubble, tables, to-do
lists, callouts and code, in light and dark.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fveniameen%2Fgotipe%2Ftree%2Fmain%2Fexamples%2Fnextjs&project-name=gotipe-editor&repository-name=gotipe-editor)
[![Open in CodeSandbox](https://assets.codesandbox.io/github/button-edit-lime.svg)](https://codesandbox.io/p/devbox/github/veniameen/gotipe/tree/main/examples/nextjs)

## Start

```bash
npx create-next-app@latest my-editor --example https://github.com/veniameen/gotipe/tree/main/examples/nextjs
cd my-editor
npm run dev
```

Open http://localhost:3000 and type `/` on an empty line.

## What is where

| File | Contents |
|---|---|
| `components/editor.tsx` | The editor: a client component with the welcome document |
| `app/page.tsx` | The page that renders `<Editor />` |
| `app/globals.css` | Gives the page the editor's background and text colours |

The editor is created in the browser after the page mounts. During server rendering, and until
the editor exists, `BlockEditor` shows a loading skeleton.

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
class on `<html>`, as next-themes and shadcn/ui do, the editor follows that class instead.
Colours, fonts and the four views are covered in [theming](https://gotipe.com/docs/ui/theming/).

## Packages

`@gotipe/block-editor` is the ready UI. It needs `@gotipe/core`, `@gotipe/react`, `@gotipe/theme`,
`@gotipe/i18n`, `@gotipe/markdown`, `@gotipe/suggestions` and `@gotipe/versions`. `@gotipe/wasm` is
there because `@gotipe/core` can load the Rust engine on demand and Next.js has to resolve that
import. The editor runs with `engine: "js"`, so the page never downloads WebAssembly. Use
`engine: "wasm"` when you add [collaboration](https://gotipe.com/docs/collaboration/overview/),
which needs the Rust engine.

## Also with shadcn

The same component installs into an existing project with the shadcn CLI:

```bash
npx shadcn@latest add veniameen/gotipe/block-editor
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
