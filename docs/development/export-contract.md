# Export and server rendering contract

`@gotipe/export` exposes HTML, Markdown, plain text, PDF and DOCX export. The
first three return strings using the editor's document. PDF/DOCX return
`Promise<Uint8Array>` and initialize the separate optional `@gotipe/export-wasm`
package on the first request. Headless editing does not download that exporter.
These APIs do not import DOCX, PDF or a Notion archive.

## HTML and Markdown

`exportToHtml(editor, { classPrefix, includeStyles })` supports a CSS identifier
prefix (for example `article-` adds `article-paragraph`) and neutral inline
structural styles. Existing explicit table alignment and inline marks remain.
Without options it returns the editor's semantic HTML. It does not capture
computed application styles or a screenshot of the editor.

`serializeHtml(blocks, { classPrefix, inlineStyles })` from `@gotipe/core` applies
the same canonical serializer without constructing an editor or using the DOM.
`renderToHtml(document, options)` from `@gotipe/core/server` uses that serializer
and additionally supports trusted host `blockRenderers`. Their returned HTML is
the host's responsibility; ordinary document text, colors and URLs are validated
and escaped by GoTipe. `renderToMarkdown` and `renderToText` are also headless.

`exportToMarkdown(editor)` preserves the editor's Markdown contract, including
untouched source. It has no CSS/class options. PDF/DOCX likewise do not accept
HTML presentation options. Unsupported option names throw before asset access
or exporter loading instead of silently succeeding.

## PDF and DOCX

PDF uses GoTipe's own block layout, wrapping and pagination, with dedicated PDF
and font codecs. It never evaluates source code, discovers system fonts, or reads
arbitrary files, packages or network resources. Options are `pageSize` (`a4`, `letter`, `legal`),
`fontSize`, margins in points, and plain text `headerTemplate`/`footerTemplate`.
The header/footer strings are text, not executable templates. Large headers and
footers reserve their measured height; impossible content areas fail explicitly.

PDF preserves paragraphs, six heading levels and nested outline bookmarks, marks
(including combined bold/italic/code, underline, strike, super/subscript, colors,
highlight and links), nested numbered/bullet/task lists, raster images/captions,
merged table cells, parallel columns, boxed callouts/toggles and literal math/raw
text. Code blocks retain source text with lexical syntax colors. Unknown blocks,
marks, unsafe links and characters outside the embedded fonts fail explicitly.
Leaves with unsupported children and structural containers with unsupported own
text also fail before rendering; known block names never justify dropping content.
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
hyperlinks, image captions and embedded raster assets. XML-invalid characters
produce an error. Columns are rendered sequentially; list markers are text;
math remains literal text; table row spans requiring continuation cells return
an explicit error. No undocumented bookmarks/header/import API is promised.

Both formats accept `resolveImage(source): Promise<Uint8Array | Blob>`. The host
owns credentials, authorization and URL access. Export clones the document,
resolves each URL once per export, and never mutates editor state. Embedded
PNG/JPEG/GIF data is decoded with dimension and allocation limits; images above
4096 pixels per axis or the memory budget fail. SVG and arbitrary files are not
loaded through this path. Unknown block/mark types fail explicitly.

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
