---
title: Import and export
description: Which formats GoTipe reads and writes in the browser, in Node and on a server, and the @gotipe/export API for HTML, Markdown and plain text.
packages: ["@gotipe/export", "@gotipe/core", "@gotipe/markdown"]
license: MIT
---

GoTipe's own document JSON is the only lossless format: it keeps every block, attribute,
mark and ID. Everything else is a conversion. Use HTML, Markdown and plain text for
publishing, search and copy; PDF and DOCX for files people download; Markdown and HTML to
bring content in. No converter fetches URLs on its own.

## Formats

| Format | Import | Export in the browser | Export in Node | Export on a server |
|---|---|---|---|---|
| GoTipe JSON | `createEditor({ content })`, `editor.setContent(doc)` | `editor.getJSON()` | `editor.getJSON()` | `gotipe-convert json`, Cloud `json` |
| HTML | `editor.setContent(html)`, browser only | `exportToHtml`, `serializeHtml` | `exportToHtml`, `renderToHtml` | `gotipe-convert html`, Cloud `html` |
| Markdown (GFM) | `parseMarkdown` from `@gotipe/markdown`, `gotipe-convert parse-markdown` | `exportToMarkdown` | `exportToMarkdown`, `renderToMarkdown` | `gotipe-convert markdown`, Cloud `markdown` |
| Plain text | — | `exportToPlainText` | `exportToPlainText`, `renderToText` | `gotipe-convert plaintext`, Cloud `plaintext` |
| PDF | — | [`exportToPdf`](/docs/conversion/pdf) | `exportToPdf` | `gotipe-convert pdf`, Cloud `pdf` |
| DOCX | — | [`exportToDocx`](/docs/conversion/docx) | `exportToDocx` | `gotipe-convert docx`, Cloud `docx` |
| ProseMirror, Tiptap, Slate, Lexical JSON | [`@gotipe/migration`](/docs/conversion/migration) | — | — | — |

The server column is the native converter and GoTipe Cloud export jobs, described in
[Server-side conversion](/docs/conversion/server).

> [!NOTE]
> GoTipe does not import DOCX, PDF or Notion exports, and it does not export to other
> editors' JSON. A string passed to `setContent` is always parsed as HTML, not Markdown.

## Install

```sh
npm install @gotipe/core @gotipe/export
```

HTML, Markdown and plain text need nothing else. PDF and DOCX also need the optional
`@gotipe/export-wasm` package, which loads on the first PDF or DOCX call. Without it the app
still builds, in Next.js too; with `@gotipe/export` 0.1.1 or older, Next.js stops at
`Module not found: Can't resolve '@gotipe/export-wasm'` until you update it or install the
package.

## Export HTML, Markdown and text

The export functions take an editor. In Node, use a headless editor from
`@gotipe/core/server`; it needs no DOM and no WASM.

```ts tab="Browser"
import { createEditor } from "@gotipe/core";
import { DefaultPreset } from "@gotipe/core/presets";
import { exportToHtml, exportToMarkdown, exportToPlainText } from "@gotipe/export";

const editor = await createEditor({
  extensions: DefaultPreset,
  content: {
    version: 1,
    blocks: [
      { id: "title", type: "heading", attrs: { level: 1 }, content: [{ text: "Release notes", marks: [] }], children: [] },
      {
        id: "intro",
        type: "paragraph",
        attrs: {},
        content: [
          { text: "Export is ", marks: [] },
          { text: "lossless", marks: [{ type: "bold", attrs: {} }] },
          { text: " for JSON only.", marks: [] },
        ],
        children: [],
      },
    ],
  },
});

const html = exportToHtml(editor, { classPrefix: "doc-", inlineStyles: true });
const markdown = exportToMarkdown(editor); // "# Release notes\n\nExport is **lossless** for JSON only.\n"
const text = exportToPlainText(editor); // "Release notes\nExport is lossless for JSON only."
```

```ts tab="Node"
import { readFile, writeFile } from "node:fs/promises";
import { createHeadlessEditor } from "@gotipe/core/server";
import { exportToHtml, exportToMarkdown, exportToPlainText } from "@gotipe/export";

const document = JSON.parse(await readFile("document.json", "utf8"));
const editor = await createHeadlessEditor({ extensions: [] });
try {
  editor.setContent(document);
  await writeFile("document.html", exportToHtml(editor, { inlineStyles: true }));
  await writeFile("document.md", exportToMarkdown(editor));
  await writeFile("document.txt", exportToPlainText(editor));
} finally {
  editor.destroy();
}
```

A headless editor with `extensions: []` has no schema, so it accepts any block types.

## exportToHtml

`exportToHtml(editor, options?)` returns an HTML fragment: one element per block, separated
by newlines, without `<html>` or `<body>`.

| Option | Type | Default | Description |
|---|---|---|---|
| `classPrefix` | `string` | — | Adds one class per block from the prefix and the block type: `"doc-"` gives `doc-paragraph`, `doc-bulletList`. Must match `^[a-zA-Z_][a-zA-Z0-9_-]*$`. |
| `inlineStyles` | `boolean` | `false` | Adds neutral inline styles (spacing, table borders, code background) so the fragment reads well on its own page. The earlier name `includeStyles` is still accepted. |

Any other option name throws a `TypeError` before work starts. Text is escaped; link targets
pass `toSafeHref` (`http:`, `https:`, `mailto:` or a relative URL); image sources accept
`http(s)`, relative URLs and base64 `data:` URLs of PNG, JPEG, GIF and WebP; colors pass
`toSafeColor`. The result does not include your application's CSS.

| Block | HTML |
|---|---|
| `paragraph`, `heading` | `<p>`, `<h1>`–`<h6>` |
| `bulletList`, `orderedList`, `listItem` | `<ul>`, `<ol start>`, `<li>` |
| `todoList`, `todoItem` | `<ul class="todo-list">` with a disabled checkbox per `<li>` |
| `codeBlock` | `<pre><code class="language-…">`; no class for plain text (`""`, `plain`, `plaintext`) |
| `blockquote`, `divider` | `<blockquote>`, `<hr>` |
| `callout` | `<div class="callout">` |
| `image` | `<figure><img>`, with `<figcaption>` when there is a caption |
| `table`, `tableRow`, `tableHeader`, `tableCell` | `<table>`, `<tr>`, `<th>`, `<td>` with `colspan`, `rowspan` and `text-align` |
| `toggle` | `<details><summary>`, `open` kept |
| `columns`, `column` | `<div class="columns">`, `<div class="column">` |
| `file`, `embed` | `<p><a href>` with the file name, or the address without one |
| other types, `math`, `markdownRaw` | `<p>` with the block's text, then its children |

A block's children are always written, also under a paragraph, heading, image or file.

Marks become `<strong>`, `<em>`, `<u>`, `<s>`, `<code>`, `<sup>`, `<sub>`, `<a href title>`,
`<span style="color:…">` for text color and `<mark style="background:…">` for highlight.

Two functions in `@gotipe/core` use the same serializer without an editor:

- `serializeHtml(blocks, { classPrefix, inlineStyles })` — synchronous, DOM-free.
- `renderToHtml(document, { classPrefix, inlineStyles, blockRenderers })` from
  `@gotipe/core/server` — async; `blockRenderers` maps a block type to a function that returns
  HTML. That HTML is inserted as is, so it is your code's responsibility to escape it.

All three accept `inlineStyles` and its earlier name `includeStyles`. Without options,
`exportToHtml(editor)` returns `editor.getHTML()`, which uses the same serializer on the JS and
WASM engines; the server's `gotipe-convert html` writes the same HTML too.

## exportToMarkdown

`exportToMarkdown(editor)` returns `editor.getMarkdown()`: canonical GitHub-flavoured Markdown
for the current document. It has no options; passing any throws a `TypeError`. Empty blocks
are left out, and front matter is not written: it is not part of the document.

To save an existing file without rewriting it, keep its parse snapshot and call
`serializeMarkdown(editor.getJSON(), snapshot)` from `@gotipe/markdown` — see
[Markdown](/docs/conversion/markdown). `exportToMarkdown` takes an editor, not a file, so it
does not keep source bytes or front matter. `PageEditor` does this for you.

## exportToPlainText

`exportToPlainText(editor)` returns the text of every block in document order. Blocks and
nested blocks are separated by `\n`, cells of a table row by a tab. Marks, links and images
are dropped.

## Import

- **JSON** — `createEditor({ content: doc })` or `editor.setContent(doc)`. A document that does
  not match the editor's schema throws `VALIDATION_ERROR`; check first with
  `editor.validate(doc)`.
- **HTML** — `editor.setContent(html)`. The string is parsed with `DOMParser` into an inert
  document and converted to blocks; it is never inserted into the page. Headings, paragraphs,
  lists, task lists, quotes, code blocks, images and figures, tables with spans, `<details>`,
  rules and inline formatting are kept. `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`,
  `<template>`, `<noscript>` and form inputs are dropped; other containers are flattened.
  Without `DOMParser` (Node), markup throws `PARSE_ERROR`.
- **Markdown** — `parseMarkdown(text).doc` from `@gotipe/markdown`, then `setContent`. See
  [Markdown](/docs/conversion/markdown) for the node types the parser produces.
- **Other editors** — [Migration](/docs/conversion/migration).

## Related

- [Content formats](/docs/concepts/content-formats)
- [PDF export](/docs/conversion/pdf) and [DOCX export](/docs/conversion/docx)
- [Server-side conversion](/docs/conversion/server)
- [Security](/docs/resources/security)
