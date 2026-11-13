# Export and server rendering contract

`@gotipe/export` exposes HTML, Markdown, plain text, PDF and DOCX export. The
first three return strings using the editor's document. PDF/DOCX return
`Promise<Uint8Array<ArrayBuffer>>` and initialize the separate optional `@gotipe/export-wasm`
package on the first request. Headless editing does not download that exporter.
These APIs do not import DOCX, PDF or a Notion archive.

## HTML and Markdown

`exportToHtml(editor, { classPrefix, inlineStyles })` supports a CSS identifier
prefix (for example `article-` adds `article-paragraph`) and neutral inline
structural styles. `includeStyles`, the option's earlier name, is still accepted;
the two may not disagree. Existing explicit table alignment and inline marks remain.
Without options it returns `editor.getHTML()`. It does not capture computed
application styles or a screenshot of the editor.

There is one HTML contract. `serializeHtml(blocks, { classPrefix, inlineStyles })`
from `@gotipe/core` is the canonical serializer: it needs no editor or DOM, and
`editor.getHTML()` uses it on both engines, so the JS and WASM engines return the
same HTML for the same document. `renderToHtml(document, options)` from
`@gotipe/core/server` uses it and additionally supports trusted host
`blockRenderers`. Their returned HTML is the host's responsibility; ordinary document
text, colors and URLs are validated and escaped by GoTipe. The native exporter
(`gotipe-convert html`, Cloud `html` jobs) writes byte-identical HTML:
`crates/gotipe-export/tests/fixtures/html-parity.json` is checked by the Rust and the
core test suites. A block's children are always written, also under a paragraph,
heading, code block, divider, image or file, so no text is dropped.
`renderToMarkdown` and `renderToText` are also headless.

`exportToMarkdown(editor)` returns `editor.getMarkdown()`: canonical Markdown of the
current document. It has no options, and front matter is not part of the document.
Untouched source bytes and front matter live in the parse snapshot of
`@gotipe/markdown`; a host that saves a Markdown file calls
`serializeMarkdown(editor.getJSON(), snapshot)` (PageEditor's `MarkdownSession` does).
`@gotipe/export` takes an editor, not a file session, so it does not duplicate that
snapshot API. PDF/DOCX likewise do not accept HTML presentation options. Unsupported
option names throw before asset access or exporter loading instead of silently
succeeding.

Both Markdown writers (`@gotipe/markdown` and the native converter) write a `math`
block as a `$$` block with the TeX source, or as a ```` ```math ```` fence (longer than
any backtick run inside) when the TeX holds a line of its own `$$`. Both parsers read a
`$$` block (opening and closing `$$` on their own lines; the body taken raw, without
inline parsing; it does not interrupt a paragraph) and a ```` ```math ```` fence back as
`math` with `display: "block"`, so TeX comes back unchanged. A `file` and an `embed` are
a link line `[name or address](address)`; an embed reads back as a paragraph with that
link. A quote's children follow its text after a `>` line. An empty formula and an embed
without an address are skipped at any depth. Code whose language is `plain` or
`plaintext` (older documents) gets a bare fence and no `language-` class in HTML.
`crates/gotipe-export/tests/fixtures/markdown-writer.json` pins the bytes and the
read-back for both writers and both parsers.

## PDF and DOCX

PDF uses GoTipe's own block layout, wrapping and pagination, with dedicated PDF
and font codecs. It never evaluates source code, discovers system fonts, or reads
arbitrary files, packages or network resources. Options are `pageSize` (`a4`, `letter`, `legal`),
`fontSize`, margins in points, plain text `headerTemplate`/`footerTemplate`, and the
document's `lang` (a BCP 47 tag), `title` and `author`. Without `lang` the file declares
no language rather than a wrong one. The header/footer strings are text, not
executable templates. Large headers and footers reserve their measured height;
impossible content areas fail explicitly.

PDF preserves paragraphs, six heading levels and nested outline bookmarks, marks
(including combined bold/italic/code, underline, strike, super/subscript, colors,
highlight and links), nested numbered/bullet/task lists, raster images/captions,
merged table cells, parallel columns, boxed callouts/toggles and literal math/raw
text. Code blocks retain source text with lexical syntax colors. Unknown blocks,
marks and characters outside the embedded fonts fail explicitly.
Leaves with unsupported children and structural containers with unsupported own
text also fail before rendering; known block names never justify dropping content.

Every document the editor can produce exports. A downloaded file has no page to
resolve a relative reference against, so PDF and DOCX link only absolute `http(s)` and
`mailto:` addresses (PDF URIs percent-encode non-ASCII bytes) and `#<blockId>` of a
block shown in the same file: a PDF GoTo action to a named destination keyed by the
block ID, placed where the block lands after pagination, or a DOCX bookmark with an
anchor hyperlink. Every other reference — a relative or `/` path, `//host`, an unknown
fragment or one to an empty placeholder, an inline `data:` upload, another scheme
including `javascript:` — keeps its visible text without a link; a URL never fails an
export.
A file or embed shows its name, otherwise its address; an inline upload without a
name shows its media type, never the encoded bytes. The placeholders the editor
inserts before an upload (an image without a source, a file or embed without an
address) export as nothing, an image placeholder with a caption as that caption.
Font shaping handles ligatures, combining sequences, bidi text and emoji clusters;
subsetting and Unicode mappings retain searchable/selectable text. The embedded
font coverage is explicit, not a promise to cover every Unicode script.
PDF retains a connected structure tree for reading order, headings, lists,
table spans, image alternative text and link annotations, plus XMP metadata.
This does not claim PDF/UA or PDF/A certification. Export complexity is bounded
to 64 nested levels, 100,000 blocks and 10,000 pages; limits fail explicitly.

Tables and columns measure and pack each cell/column independently; a neighboring
image does not change the spacing between its text lines. Normal table rows stay together
when they fit a page; oversized rows continue at complete text/image boundaries,
including cells spanning multiple logical rows. Images keep their aspect ratio
and fit the available region. Long words and code lines wrap at grapheme boundaries.
PDF is a document layout, not a pixel copy of the editor's responsive CSS or of
the former Typst output. A4, US Letter and US Legal use their actual page dimensions.

DOCX uses GoTipe's own OOXML renderer, OPC relationships and a maintained ZIP
codec. Options are `title`, `author` and `description`. The renderer preserves
paragraphs, headings, nested lists, supported marks and colors, tables,
hyperlinks (by the same link rule as PDF), image captions and embedded raster assets.
XML-invalid characters produce an error. Columns are rendered sequentially; list markers are text;
math remains literal text; table row spans requiring continuation cells return
an explicit error. No undocumented bookmarks/header/import API is promised.

Both formats accept `resolveImage(source): Promise<Uint8Array | Blob>`. The host
owns credentials, authorization and URL access. Export clones the document,
resolves each URL once per export, and never mutates editor state. Embedded
PNG/JPEG/GIF/WebP data — the formats the editor uploads — is decoded with dimension
and allocation limits. One image may hold 10 MiB of data, the editor's limit for
files kept inside the document; one export may embed 64 MiB, checked by
`@gotipe/export` and again by the renderer (native and WASM) before decoding. Document
JSON is read as `decodeDocument` reads it: block IDs non-empty and unique, block and
mark types non-empty. `data:` payloads are
decoded as browsers decode them (ASCII whitespace and missing padding are accepted).
Images above 4096 pixels per axis or the memory budget fail. SVG and arbitrary files
are not loaded through this path. Unknown block/mark types fail explicitly.

Failures reject with `ExportError` (`name` `GoTipeExportError`) and a stable `code`:
`INVALID_OPTIONS`, `PARSE_ERROR`, `UNSUPPORTED_BLOCK_TYPE`, `UNSUPPORTED_MARK`,
`IMAGE_ERROR`, `FONT_NOT_FOUND`, `ENCODING_ERROR` or `EXPORTER_UNAVAILABLE`. The
optional WASM module rejects with an `Error` carrying the same `name` and `code`, and
the native converter uses the same codes (`ConvertError::code`). Unsupported option
names remain a `TypeError`; an error thrown by `resolveImage` propagates unchanged.
Both functions resolve to `Uint8Array<ArrayBuffer>`, which `Blob` accepts as is.

Cloud jobs call the same native `gotipe-convert` renderer. Invalid input,
conversion failures, timeouts, upload failures and authorization failures remain
errors. A file extension or magic prefix alone is not an export acceptance test.

## Acceptance

`pnpm check:exports` invokes the public browser-compatible package in Node, then
independently parses every XML/relationship part and checks ZIP integrity with
Python, validates PDF with Poppler, extracts Cyrillic/emoji text, and checks
marks, table structure, image data and escaped metadata. Native CLI output uses
the same validator with its expected metadata. `pnpm check:pdf-regression` also
compares a fixed native/WASM corpus using independent Poppler/pypdf checks for
text, typography, links, images, outlines, page dimensions and overflow. Browser
tests call the public API in Chromium, Firefox and WebKit and validate the saved
PDF bytes independently. Current receipts belong in
ignored `output/`; the [release plan](../22-release-readiness.md) tracks current
results and remaining acceptance work. This is the current contract; the long
numbered export/API designs contain historical proposals.
