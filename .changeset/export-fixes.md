---
"@gotipe/export": patch
"@gotipe/export-wasm": patch
"@gotipe/markdown": patch
"@gotipe/core": patch
"@gotipe/wasm": patch
---

Export every document the editor can produce, with one HTML and one Markdown contract.

- PDF and DOCX accept WebP images, the fourth format the editor uploads (pure-Rust
  `image-webp` decoder, `#![forbid(unsafe_code)]`). One image may hold 10 MiB, the editor's
  limit for files kept in the document (it was 8 MiB resolved and 12 MiB of `data:` text, so
  9–10 MiB uploads failed); one export may embed 64 MiB. `data:` payloads decode as browsers
  decode them: ASCII whitespace and missing padding are accepted.
- The placeholders the editor inserts before an upload no longer fail an export: an image
  without a source exports as nothing (or its caption), a file or embed without an address as
  nothing.
- A link or attachment address never fails an export. A downloaded file has nothing to resolve
  a relative reference against, so only absolute `http(s)`/`mailto:` addresses and `#`
  fragments become links; relative and `/` paths, inline `data:` uploads and other schemes
  keep their text without a link. An inline upload without a name shows its media type.
  Previously relative paths and `data:` files failed, and a `/path` became a link to a local
  file.
- `exportToPdf` takes `lang` (BCP 47), `title` and `author`. Without `lang` the file declares
  no language instead of always `en`.
- Failures reject with `ExportError` (`name` `GoTipeExportError`) and a stable `code`
  (`INVALID_OPTIONS`, `IMAGE_ERROR`, `UNSUPPORTED_BLOCK_TYPE`, …); the WASM module rejects with
  an `Error` carrying the same code instead of a string. Option names unknown to the WASM
  module are rejected.
- `exportToPdf` and `exportToDocx` resolve to `Uint8Array<ArrayBuffer>`, which `new Blob([bytes])`
  accepts under TypeScript 5.9 without a copy.
- `getHTML()` returns the same HTML on the JS and WASM engines: both use the canonical
  serializer (`serializeHtml`). The native converter's HTML (`gotipe-convert html`, Cloud jobs)
  is now byte-identical to it, including `<br>` for hard breaks, `<figure>` with captions and
  `data:`/relative image sources, checked by a shared fixture. Children of a paragraph,
  heading, code block, divider, image or file are written instead of dropped, and a file or
  embed without a name is labelled by its address.
- `serializeHtml`, `renderToHtml` and `exportToHtml` accept both `inlineStyles` and its earlier
  name `includeStyles`; the two may not disagree.
- Markdown writes a formula as a `$$` block and an embed as a link line in both the TS and the
  native writer (formulas were bare TeX and embeds were dropped). An empty formula and an embed
  without an address are skipped.
- `exportToMarkdown` stays canonical: its contract no longer promises untouched source bytes,
  which live in the `@gotipe/markdown` parse snapshot (`serializeMarkdown(doc, snapshot)`).
- A link to `#` and the ID of a block shown in the document jumps inside PDF and DOCX files: a
  PDF GoTo action to a named destination with the block's ID (placed where the block lands
  after pagination), a DOCX bookmark with an anchor hyperlink. A fragment that names no block,
  or an empty placeholder, stays text. Non-ASCII characters of PDF link URIs are
  percent-encoded.
- The native converter reads document JSON as the editor does: empty block or mark types and
  duplicate block IDs are rejected. It also enforces the 64 MiB image budget per export.
- `parseMarkdown` and the native parser read a `$$` block (opening and closing `$$` on their
  own lines; the body raw; it does not interrupt a paragraph) and a ```` ```math ```` fence as a
  `math` block with `display: "block"`. Both writers fall back to a ```` ```math ```` fence when
  the TeX has a line of its own `$$`, so TeX with `\\`, `*a*`, blank lines or list markers
  comes back unchanged. The Rust default schema declares `math.display` as the core extension
  does.
- Both Markdown writers write a `file` as `[name or address](address)`, a quote's children after
  a `>` line, skip an empty formula or embed at any depth, and write code in `plain`/`plaintext`
  with a bare fence; HTML gives such code no `language-` class.
- `WasmEditorLike` no longer needs `export_html`/`export_markdown`; `getHTML()` on the WASM
  engine goes through the TS serializer.
