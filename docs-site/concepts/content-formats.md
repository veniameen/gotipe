---
title: Content formats
description: Load and save GoTipe documents as JSON, HTML, Markdown and plain text, and render them on a server.
packages: ["@gotipe/core", "@gotipe/markdown"]
license: MIT
---

The editor's own format is the [document JSON](/docs/concepts/document-model); store that
when you need every attribute and ID. HTML, Markdown and plain text are conversions in and
out of it. The same serializers run in the browser and, through `@gotipe/core/server`, on
a server.

| Format | In | Out |
|---|---|---|
| JSON | `createEditor({ content })`, `editor.setContent(doc)` | `editor.getJSON()` |
| HTML | `createEditor({ content: html })`, `editor.setContent(html)`; browser only | `editor.getHTML()`, `serializeHtml()`, `renderToHtml()` |
| Markdown | `parseMarkdown()` from `@gotipe/markdown`, then `setContent` | `editor.getMarkdown()`, `renderToMarkdown()` |
| Plain text | Build JSON yourself | `editor.getText()`, `renderToText()` |

## JSON

```ts
const saved = editor.getJSON();
editor.setContent(saved, { preserveSelection: true, addToHistory: true });
```

| Option | Type | Default | Description |
|---|---|---|---|
| `preserveSelection` | `boolean` | `false` | Keep the selection on blocks whose IDs still exist, or on the block at the same position. Otherwise the caret goes to the start. |
| `addToHistory` | `boolean` | `false` | Make the replacement one undo step. Otherwise the undo history is cleared. |

`setContent` validates the whole document first and throws `VALIDATION_ERROR` without
changing anything. It emits `update`, `selectionChange` and `viewStateChange`, but not
`transaction`, and transaction filters don't see it.

> [!WARNING]
> A string passed to `createEditor({ content })` or `setContent` is always read as HTML.
> `validate()` and the server functions take a document object only: a string returns
> `false` from `validate()` and makes `renderToHtml`, `renderToMarkdown` and `renderToText`
> reject with a `TypeError`. Parse JSON strings yourself: `editor.setContent(JSON.parse(json))`.

## HTML

### Import

HTML import parses the string with the browser's `DOMParser`; nothing is inserted into the
live page. In Node a string without tags becomes one paragraph, and a string with tags
throws `PARSE_ERROR`.

| HTML | Result |
|---|---|
| `p` | `paragraph`; a paragraph containing an image is split around it |
| `h1` … `h6` | `heading` with `level` |
| `ul`, `ol` (with `start`) | `bulletList`, `orderedList` with `listItem` children; nested lists become children of the item |
| `li` with a checkbox or `data-type="taskItem"` | `todoList` with `todoItem` and `checked` |
| `blockquote` | `blockquote` with its text |
| `pre` with `code class="language-x"` | `codeBlock` with `language` (`"plain"` without a class) |
| `hr` | `divider` |
| `img`; `figure` with `figcaption` | `image` with `src`, `alt`, `caption`, `width`, `height` |
| `table`, `tr`, `td`, `th` | `table`, `tableRow`, `tableCell`, `tableHeader` with `colspan`, `rowspan`, `align` |
| `details` with `summary` | `toggle` with `open` and its body |
| `div`, `section`, `article`, `main`, `header`, `footer` | Their contents |
| `script`, `style`, `noscript`, `template`, `iframe`, `object`, `embed` | Dropped |

Inline elements and styles become marks: `b`, `strong` or `font-weight` of 600 and more →
`bold`; `i`, `em`, `font-style: italic` → `italic`; `u` → `underline`; `s`, `strike`,
`del`, `line-through` → `strikethrough`; `code`; `sup`, `sub`; `mark` and
`background-color` → `highlight`; `color` → `textColor`; `a` → `link`. A `br` becomes `\n`,
and an inline image becomes its alt text. Whitespace collapses as in a browser, so a plain
string with line breaks becomes one paragraph.

Links keep only `http:`, `https:`, `mailto:` and relative URLs; images also accept PNG,
JPEG, GIF and WebP `data:` URLs. Colours must be plain CSS colours. The result must still
fit the editor's schema: importing a task list needs the `TodoList` extension.

### Export

`serializeHtml(blocks, options)` turns blocks into HTML without an editor or a DOM:

```ts
import { serializeHtml } from "@gotipe/core";

const html = serializeHtml(editor.getJSON().blocks, { classPrefix: "doc-" });
// <h1 class="doc-heading">Launch plan</h1>
```

| Option | Type | Default | Description |
|---|---|---|---|
| `classPrefix` | `string` | — | Add a class per block: `doc-` gives `doc-paragraph`. Must be a CSS identifier prefix. |
| `inlineStyles` | `boolean` | `false` | Add neutral `style` attributes so the HTML reads well without your CSS. |

Text is escaped, and link, image and colour values are validated as on import. Callouts
become `div.callout`, task lists `ul.todo-list` with disabled checkboxes, images `figure`,
toggles `details`, and files and embeds a paragraph with a link. A block type the
serializer doesn't know becomes a paragraph with its text.

`editor.getHTML()` returns the same output on both engines, and so does the server's
`gotipe-convert html`. `inlineStyles` is also accepted under its earlier name `includeStyles`.

## Markdown

`editor.getMarkdown()` writes GitHub-flavoured Markdown with GoTipe's own serializer, the
same on both engines. To load Markdown, parse it with `@gotipe/markdown`:

```ts title="markdown.ts"
import { type GoTipeEditor, defineExtension } from "@gotipe/core";
import { DefaultPreset } from "@gotipe/core/presets";
import { parseMarkdown } from "@gotipe/markdown";

// Keeps Markdown the editor can't edit (HTML, footnotes, link definitions) as it is.
export const MarkdownRaw = defineExtension({
  name: "markdownRaw",
  nodes: [
    {
      name: "markdownRaw",
      group: ["block"],
      content: "rawText",
      attrs: { kind: { type: "string", default: "" } },
      topLevel: true,
      marksAllowed: "none",
      leaf: true,
      allowsChildren: false,
    },
  ],
  marks: [{ name: "mdRaw", attrs: {}, rank: 90 }],
});

export const extensions = [DefaultPreset, MarkdownRaw];

// Create the editor with these extensions, then load files with loadMarkdown.
export function loadMarkdown(editor: GoTipeEditor, text: string) {
  editor.setContent(parseMarkdown(text).doc);
}
```

The parser keeps constructs it can't map to blocks as `markdownRaw` blocks and inline
`mdRaw` text, so a schema without them rejects documents that contain HTML, footnotes or
inline images. `parseMarkdown` also returns a `snapshot`; pass it to `serializeMarkdown(doc,
snapshot)` to write untouched blocks back byte for byte. [PageEditor](/docs/ui/page-editor)
does all of this for you. The syntax mapping is in [Markdown](/docs/conversion/markdown).

> [!NOTE]
> A `\n` inside a paragraph is written as a hard break, `\` before the line ending, which
> every CommonMark renderer shows as a line break. A plain line ending inside a paragraph of
> a file is a soft break and reads as a space.

## Plain text

`editor.getText()` joins the text of all blocks, nested ones included, with `\n`; cells of
a table row are separated by a tab. Raw text is included, and blocks without text, such as
images, give empty lines.

To load plain text, build paragraphs:

```ts
import { createId } from "@gotipe/core";

const text = "First line\nSecond line";
editor.setContent({
  version: 1,
  blocks: text.split("\n").map((line) => ({
    id: createId(),
    type: "paragraph",
    attrs: {},
    content: line ? [{ text: line, marks: [] }] : [],
    children: [],
  })),
});
```

## Server rendering

`@gotipe/core/server` renders documents without a browser or WebAssembly:

```ts title="render.ts"
import { readFile } from "node:fs/promises";
import { renderToHtml, renderToMarkdown, renderToText } from "@gotipe/core/server";

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const doc = JSON.parse(await readFile("document.json", "utf8"));

const html = await renderToHtml(doc, {
  classPrefix: "doc-",
  inlineStyles: true,
  blockRenderers: {
    chart: (block) => `<figure class="chart">${escapeHtml(String(block.attrs.title ?? ""))}</figure>`,
  },
});
const markdown = await renderToMarkdown(doc);
const text = await renderToText(doc);
```

| Function | Returns |
|---|---|
| `renderToHtml(content, options?)` | HTML with the `serializeHtml` options, plus `blockRenderers` |
| `renderToMarkdown(content)` | Markdown |
| `renderToText(content)` | Plain text |
| `createHeadlessEditor({ extensions })` | A full editor on the JS engine with no DOM and no user input |

`content` is a document object; parse JSON with `JSON.parse` first. A string rejects with a
`TypeError`. The render functions use no schema, so they accept any block type. `blockRenderers` maps a block type to a function that returns
HTML for that block; the string is inserted as is, so escape what you put in it.

`createHeadlessEditor` checks documents against the same extensions as your client and
runs commands and transactions. It has no `content` option; load with `setContent`:

```ts
import { DefaultPreset } from "@gotipe/core/presets";
import { createHeadlessEditor } from "@gotipe/core/server";

export async function toMarkdown(doc: object): Promise<string> {
  const editor = await createHeadlessEditor({ extensions: [DefaultPreset] });
  try {
    if (!editor.validate(doc)) throw new Error("Not a valid document for this schema");
    editor.setContent(doc);
    return editor.getMarkdown();
  } finally {
    editor.destroy();
  }
}
```

PDF and DOCX come from `@gotipe/export`; see [import and export](/docs/conversion/overview).

## Related

- [Document model](/docs/concepts/document-model)
- [Markdown](/docs/conversion/markdown)
- [Server rendering](/docs/conversion/server)
