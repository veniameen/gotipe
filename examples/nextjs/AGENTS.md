# GoTipe starter for Next.js

A Next.js App Router app with a GoTipe block editor.

- The editor is `components/editor.tsx`, a client component. Pages render `<Editor />` and pass
  `initialContent` (GoTipe JSON or HTML) and `onChange`.
- `onChange` gets the editor: read the document with `editor.getJSON()`, `editor.getMarkdown()`
  or `editor.getHTML()`. The app stores it; GoTipe has no storage of its own.
- `BlockEditor` props, views and the page head: https://gotipe.com/docs/ui/block-editor.md
- Every docs page for agents: https://gotipe.com/llms.txt, or all of them in one file:
  https://gotipe.com/llms-full.txt
- Keep `@gotipe/wasm` installed: Next.js has to resolve the optional Rust engine import of
  `@gotipe/core`. With `engine: "js"` the page never downloads it.
- `@gotipe/block-editor` and `@gotipe/theme` are under the GoTipe Commercial License; the other
  GoTipe packages are MIT.
