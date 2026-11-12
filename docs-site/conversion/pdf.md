---
title: PDF export
description: Render a document to a tagged PDF with GoTipe's own layout and bundled fonts, in the browser or in Node.
packages: ["@gotipe/export", "@gotipe/export-wasm"]
license: MIT
---

`exportToPdf` lays out the document with GoTipe's own block layout, wrapping and pagination,
and writes a PDF 1.7 file with a structure tree and bookmarks. The renderer is Rust compiled
to a separate WebAssembly module with its fonts inside, so the result is the same in every
browser, in Node and in the native [server converter](/docs/conversion/server). It never
reads system fonts, never fetches URLs and never runs code from the document.

## Install

```sh
npm install @gotipe/export @gotipe/export-wasm
```

Your bundler must emit the package's `.wasm` file, and your server should send it as
`application/wasm` (otherwise loading falls back to a slower path with a console warning).
Under a Content Security Policy, `script-src` needs `'wasm-unsafe-eval'`.

## Export a document

```ts tab="Browser"
import type { GoTipeEditor } from "@gotipe/core";
import { exportToPdf } from "@gotipe/export";

export async function downloadPdf(editor: GoTipeEditor) {
  const bytes = await exportToPdf(editor, {
    pageSize: "letter",
    margin: { top: 54, right: 54, bottom: 54, left: 54 },
    fontSize: 11,
    headerTemplate: "Quarterly report",
    footerTemplate: "Internal",
    resolveImage: async (source) => {
      const response = await fetch(source, { credentials: "include" });
      if (!response.ok) throw new Error(`${source}: HTTP ${response.status}`);
      return response.blob();
    },
  });
  // Copy into an ArrayBuffer-backed array, which Blob's type expects.
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "report.pdf";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

```ts tab="Node"
import { readFile, writeFile } from "node:fs/promises";
import { createHeadlessEditor } from "@gotipe/core/server";
import { exportToPdf } from "@gotipe/export";

const editor = await createHeadlessEditor({ extensions: [] });
try {
  editor.setContent(JSON.parse(await readFile("document.json", "utf8")));
  await writeFile("document.pdf", await exportToPdf(editor, { pageSize: "a4" }));
} finally {
  editor.destroy();
}
```

Export works on a private copy of the document: the editor's state is never changed.

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `pageSize` | `"a4" \| "letter" \| "legal"` | `"a4"` | A4 is 595.28 × 841.89 pt, Letter 612 × 792 pt, Legal 612 × 1008 pt. |
| `margin` | `{ top, right, bottom, left }` | `72` on each side | Page margins in points (72 pt = 1 in), each from 0 to 200. |
| `fontSize` | `number` | `12` | Body text size in points, from 1 to 100. Headings scale from it. |
| `headerTemplate` | `string` | — | Plain text printed in the top margin of every page. |
| `footerTemplate` | `string` | — | Plain text printed in the bottom margin of every page. |
| `resolveImage` | `(source: string) => Promise<Uint8Array \| Blob>` | — | Returns the bytes of an image URL. Required when the document has images that are not `data:` URLs. |

The header and footer are text, not templates: there are no variables and no page numbers.
A header or footer taller than its margin pushes the content area in. Options that leave no
room for content fail with an error.

## Images

A `data:` image is embedded as it is. Any other source is passed to `resolveImage` once per
export, however often it occurs; your callback owns credentials and access checks. Without a
callback, such an image fails the export.

- Formats: PNG, JPEG and GIF (the first frame). WebP and SVG fail.
- Limits: 8 MiB per resolved image, 12 MiB per embedded `data:` URL, 32 MiB of embedded
  image data per export, 4096 pixels per side.
- An image keeps its aspect ratio. Its `width` attribute is read as CSS pixels and capped by the
  content width and the page height. The caption is printed below it, `alt` becomes the
  figure's alternative text.
- Images are stored losslessly, so a PDF with photos can be larger than the source JPEG files.

## Fonts

| Text | Font |
|---|---|
| Body text and headings | Libertinus Serif |
| Code blocks and inline code | DejaVu Sans Mono |
| Emoji | Noto Emoji (monochrome) |
| Fallback for other characters | New Computer Modern, text and math |

Each character cluster takes the first font that covers it. Text is shaped (ligatures,
combining marks, right-to-left runs, emoji sequences) and the fonts are subset, so the text
stays selectable and searchable. Latin, Cyrillic, Greek, Hebrew, Arabic, Armenian and
Georgian are covered. Chinese, Japanese, Korean and Thai are not: a character that no
bundled font covers fails the export instead of being dropped. Font licenses ship in the
package's `licenses/` folder and `THIRD_PARTY_NOTICES.md`.

## What the PDF contains

- Paragraphs and headings 1–6 (bold, ×1.7 down to ×0.9 of the body size). Headings form
  nested bookmarks.
- Bold, italic, underline, strikethrough, inline code, superscript, subscript, text color,
  highlight and links (link annotations).
- Bulleted, numbered (from the list's `start`) and task lists, nested.
- Code blocks in monospace on a light background, keywords, strings, numbers and comments
  in color. Long lines and long words wrap.
- Tables with shaded header cells, column and row spans. A row that fits stays on one page;
  a taller row continues on the next.
- Columns side by side; quotes, callouts and toggles in a box (toggles always open).
- Images with captions. Files and embeds as a link with their name.
- Math and raw Markdown blocks as their source text; dividers as a rule.

The structure tree tags headings, paragraphs, lists with labels, tables with spans, figures
with alternative text, captions, code, quotes and links in reading order. XMP metadata
records the producer and the page count.

## Loading and size

PDF and DOCX share `@gotipe/export-wasm`: 14.4 MB, 8.6 MB gzipped, most of it fonts. It is
downloaded and initialized on the first `exportToPdf` or `exportToDocx` call and reused
afterwards. Importing the editor or `@gotipe/export` never loads it, and HTML, Markdown and
text export never need it. If loading fails, the call rejects with
`Could not load optional PDF/DOCX exporters` and the next call tries again.

## Errors

Invalid option names throw a `TypeError` before anything loads. Image preparation rejects
with an `Error` (a missing source, a missing `resolveImage`, a size limit). Everything the
renderer finds rejects with a **string**, not an `Error`, so show it with `String(error)`.
Examples: `Unsupported block type: widget`, `Font not found: No embedded font covers "中"`,
`Encoding error: Unsafe link URL`, `Encoding error: Invalid PDF margin`.

## Limitations

> [!NOTE]
> The PDF is a document layout, not a copy of the editor's CSS. It is not certified as PDF/UA
> or PDF/A.

- The document language is always `en`, and there are no title or author fields.
- Table columns share the width equally; column widths and cell alignment are not applied,
  and header rows are not repeated on new pages.
- Unknown block types and marks fail. So do links and file or embed URLs other than
  `http(s)`, `mailto:`, `#…` or a path starting with `/`: a relative `guide.md`, an empty URL
  or a `data:` file fails.
- Colors must be `#rgb`, `#rrggbb` or a basic CSS name such as `navy`. An image block without
  a source fails.
- A document may have at most 64 nesting levels, 100,000 blocks, 10,000 pages and 1,024
  table columns.

## Related

- [DOCX export](/docs/conversion/docx)
- [Server-side conversion](/docs/conversion/server)
- [Import and export](/docs/conversion/overview)
- [Performance](/docs/resources/performance)
