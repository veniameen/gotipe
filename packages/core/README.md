# @gotipe/core

The headless core of GoTipe: the editor, its document model, transactions, commands, events and
the built-in extensions. It draws nothing itself; the framework adapters and the ready UI are
built on it.

[Docs](https://gotipe.com/docs/getting-started/quick-start/) · [Website](https://gotipe.com) · [Repository](https://github.com/veniameen/gotipe)

## Install

```sh
npm install @gotipe/core
```

`@gotipe/wasm` is an optional peer dependency: install it when you want the Rust engine, for
example for collaboration. Without it, use `engine: "js"`. See
[engines](https://gotipe.com/docs/getting-started/engines/).

## Usage

```ts
import { createEditor } from "@gotipe/core";
import { DefaultPreset } from "@gotipe/core/presets";

const editor = await createEditor({
  extensions: [DefaultPreset],
  engine: "js",
  content: {
    version: 1,
    blocks: [
      {
        id: "intro",
        type: "paragraph",
        attrs: {},
        content: [{ text: "Hello, GoTipe.", marks: [] }],
        children: [],
      },
    ],
  },
});

editor.on("update", ({ editor }) => localStorage.setItem("doc", JSON.stringify(editor.getJSON())));
console.log(editor.getMarkdown(), editor.getHTML());
```

To show and edit the document in a page, use an adapter such as
[`@gotipe/react`](https://www.npmjs.com/package/@gotipe/react) or
[`@gotipe/vue`](https://www.npmjs.com/package/@gotipe/vue), or mount the editor on your own
renderer with `editor.mount(element)`.

On a server, convert a document without a DOM:

```ts
import { renderToHtml } from "@gotipe/core/server";

const html = await renderToHtml(documentJson);
```

## Entry points

- `@gotipe/core`: `createEditor` (engine `"auto"`, `"js"` or `"wasm"`), `createEditorWithLoader`,
  `defineExtension`, `GoTipeError` and the document types.
- `@gotipe/core/js`: the same API with the JS engine only; nothing references WebAssembly.
- `@gotipe/core/presets`: `MinimalPreset`, `DefaultPreset` and `FullPreset`.
- `@gotipe/core/extensions`: the individual extensions (`Paragraph`, `Heading`, `Table`,
  `Placeholder`, `CharacterCount` and more).
- `@gotipe/core/server`: `renderToHtml`, `renderToMarkdown`, `renderToText` and
  `createHeadlessEditor` for Node.
- `@gotipe/core/menus`: `createBubbleMenu` and `createFloatingMenu` without a framework.
- `@gotipe/core/emoji`, `@gotipe/core/emoji/ru` and `@gotipe/core/math`: optional emoji data
  and the TeX to MathML converter.

## License

MIT. See [LICENSE](https://github.com/veniameen/gotipe/blob/main/packages/core/LICENSE).
