# GoTipe starter for Vite and React

A Vite and React app with a GoTipe block editor.

- The editor is `src/editor.tsx`. `src/main.tsx` renders `<Editor />`; pass `initialContent`
  (GoTipe JSON or HTML) and `onChange`.
- `onChange` gets the editor: read the document with `editor.getJSON()`, `editor.getMarkdown()`
  or `editor.getHTML()`. The app stores it; GoTipe has no storage of its own.
- `BlockEditor` props, views and the page head: https://gotipe.com/docs/ui/block-editor.md
- Every docs page for agents: https://gotipe.com/llms.txt, or all of them in one file:
  https://gotipe.com/llms-full.txt
- The editor runs with `engine: "js"` and needs no WebAssembly. Collaboration needs the Rust
  engine: install `@gotipe/wasm`, use `engine: "wasm"` and exclude `@gotipe/wasm` from
  `optimizeDeps` in `vite.config.ts`.
- `@gotipe/block-editor` and `@gotipe/theme` are under the GoTipe Commercial License; the other
  GoTipe packages are MIT.
