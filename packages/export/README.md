# @gotipe/export

Export a GoTipe document to HTML, Markdown, plain text, PDF and DOCX, in the browser or in
Node. HTML, Markdown and plain text are built in; PDF and DOCX use the optional
`@gotipe/export-wasm` renderer, loaded on the first call. No exporter fetches URLs on its own.

[Docs](https://gotipe.com/docs/conversion/overview/) · [Website](https://gotipe.com) · [Repository](https://github.com/veniameen/gotipe)

## Install

```sh
npm install @gotipe/export @gotipe/core
# Only for PDF and DOCX:
npm install @gotipe/export-wasm
```

`@gotipe/export-wasm` is an optional peer. Without it, the app still builds, in Next.js too,
and `exportToPdf` and `exportToDocx` reject with an `ExportError` of code
`EXPORTER_UNAVAILABLE`. With it, your bundler must emit
its `.wasm` file, and under a Content Security Policy `script-src` needs
`'wasm-unsafe-eval'`.

## Usage

```ts
import type { GoTipeEditor } from "@gotipe/core";
import { exportToHtml, exportToMarkdown, exportToPdf, exportToPlainText } from "@gotipe/export";

export async function exportAll(editor: GoTipeEditor) {
  const html = exportToHtml(editor, { classPrefix: "doc-", inlineStyles: true });
  const markdown = exportToMarkdown(editor);
  const text = exportToPlainText(editor);

  const pdf = await exportToPdf(editor, {
    pageSize: "letter",
    title: "Quarterly report",
    lang: "en-US",
    // Images are loaded only through your resolver.
    resolveImage: async (source) => (await fetch(source)).blob(),
  });
  return { html, markdown, text, pdf: new Blob([pdf], { type: "application/pdf" }) };
}
```

In Node, pass a headless editor from `@gotipe/core/server`; it needs no DOM.

- `exportToHtml(editor, { classPrefix?, inlineStyles? })` returns an HTML fragment with
  escaped text and checked link, image and color values.
- `exportToMarkdown(editor)` returns canonical GitHub-flavored Markdown.
- `exportToPlainText(editor)` returns the text of every block in document order.
- `exportToPdf(editor, options?)` writes a tagged PDF 1.7 with bundled fonts. Options:
  `pageSize`, `margin`, `fontSize`, `headerTemplate`, `footerTemplate`, `lang`, `title`,
  `author`, `resolveImage`. See [PDF export](https://gotipe.com/docs/conversion/pdf/).
- `exportToDocx(editor, options?)` writes a Word file. Options: `title`, `author`,
  `description`, `resolveImage`. See [DOCX export](https://gotipe.com/docs/conversion/docx/).
- `ExportError` carries a stable `code` for PDF and DOCX failures.

## License

MIT — see [LICENSE](https://github.com/veniameen/gotipe/blob/main/packages/export/LICENSE).
