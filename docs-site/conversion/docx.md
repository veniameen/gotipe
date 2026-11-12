---
title: DOCX export
description: Write a document as a Word file with GoTipe's own OOXML renderer, in the browser or in Node.
packages: ["@gotipe/export", "@gotipe/export-wasm"]
license: MIT
---

`exportToDocx` writes an Office Open XML document (`.docx`) with GoTipe's own renderer:
paragraphs, headings with Word heading styles, lists, tables, links and embedded images. It
runs in the same optional WebAssembly module as [PDF export](/docs/conversion/pdf), loaded on
the first call. Use it when people need to keep editing the document in Word or a compatible
editor; use PDF when the layout must not change.

## Install

```sh
npm install @gotipe/export @gotipe/export-wasm
```

The bundler and CSP requirements are the same as for PDF: emit the `.wasm` file, serve it as
`application/wasm`, and allow `'wasm-unsafe-eval'` in `script-src`.

## Export a document

```ts tab="Browser"
import type { GoTipeEditor } from "@gotipe/core";
import { exportToDocx } from "@gotipe/export";

export async function downloadDocx(editor: GoTipeEditor) {
  const bytes = await exportToDocx(editor, {
    title: "Quarterly report",
    author: "Finance team",
    description: "Q3 figures and commentary",
    resolveImage: async (source) => {
      const response = await fetch(source);
      if (!response.ok) throw new Error(`${source}: HTTP ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    },
  });
  const type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "report.docx";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

```ts tab="Node"
import { readFile, writeFile } from "node:fs/promises";
import { createHeadlessEditor } from "@gotipe/core/server";
import { exportToDocx } from "@gotipe/export";

const editor = await createHeadlessEditor({ extensions: [] });
try {
  editor.setContent(JSON.parse(await readFile("document.json", "utf8")));
  await writeFile("document.docx", await exportToDocx(editor, { title: "Quarterly report" }));
} finally {
  editor.destroy();
}
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `title` | `string` | `""` | Document title in the file's properties. |
| `author` | `string` | `""` | Creator in the file's properties. |
| `description` | `string` | `""` | Description in the file's properties. |
| `resolveImage` | `(source: string) => Promise<Uint8Array \| Blob>` | — | Returns the bytes of an image URL. Required when the document has images that are not `data:` URLs. |

Images follow the same rules as in PDF: `data:` images are embedded as they are, other
sources go through `resolveImage` once per export, and PNG, JPEG and GIF are accepted with the
same size limits. Option names other than these throw a `TypeError` before anything loads.

## What the file contains

| GoTipe | Word |
|---|---|
| Paragraph | Paragraph |
| Heading 1–6 | Paragraph with the built-in style "heading 1"…"heading 6" (outline level, navigation pane), bold, 22 pt down to 12 pt |
| Bold, italic, underline, strikethrough, superscript, subscript | Run formatting |
| Text color, highlight | Font color, shading |
| Inline code, code block | Runs in "DejaVu Sans Mono"; a code block keeps its line breaks and tabs |
| Link | External hyperlink; the text keeps the surrounding style |
| Bulleted, numbered and task lists | Paragraphs with a text marker (`•`, `3.`, `☐`, `☑`), indented 0.25 in per level |
| Quote | Paragraph; blocks inside it are indented |
| Callout, toggle | Paragraph followed by its blocks (no box; toggles open) |
| Table | Word table with column spans |
| Image | Inline picture (converted to PNG), up to 560 px wide, `alt` as its description; the caption as the next paragraph |
| File, embed | Hyperlink with the file name or URL |
| Columns | The columns one after another |
| Divider | A line of box-drawing characters |
| Math, raw Markdown | Their source text |

Pages are A4 with 1 in margins. Fonts are not embedded: Word uses its default font for text
and substitutes "DejaVu Sans Mono" when it is not installed.

## Errors

As with PDF, invalid option names throw a `TypeError`, image preparation rejects with an
`Error`, and the renderer rejects with a string (`String(error)` shows it), for example
`Encoding error: Text contains an invalid XML character` for a control character in the text.

## Limitations

> [!NOTE]
> The DOCX file keeps the content and its structure, not the editor's look. There is no DOCX
> import.

- No page size, margin, header, footer, table of contents or bookmark options.
- List markers are text, so Word does not treat the paragraphs as a numbered list. Tables have
  no borders or table style. Columns are not laid out side by side.
- A table cell that spans rows fails the export.
- Unknown block types and marks fail, and the URL and color rules of PDF apply: links and file
  or embed URLs must be `http(s)`, `mailto:`, `#…` or start with `/`.
- Math stays as its literal source; it is not converted to Word equations.

## Related

- [PDF export](/docs/conversion/pdf)
- [Import and export](/docs/conversion/overview)
- [Server-side conversion](/docs/conversion/server)
