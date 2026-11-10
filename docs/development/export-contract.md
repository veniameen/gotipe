# Export and server rendering contract

`@gotipe/export` exposes HTML, Markdown, plain text, PDF and DOCX export. The
first three return strings using the editor's document. PDF/DOCX return
`Promise<Uint8Array>` and initialize the separate optional `@gotipe/export-wasm`
package on the first request. Headless editing does not download that compiler.
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
or compiler loading instead of silently succeeding.

## PDF and DOCX

PDF uses isolated Typst 0.15.1 with bundled Unicode fonts. Its world cannot read
arbitrary files, packages or network resources. The generated source quotes
user text and safe attributes. Options are `pageSize` (`a4`, `letter`, `legal`),
`fontSize`, margins in points, and plain text `headerTemplate`/`footerTemplate`.
The header/footer strings are text, not executable templates.

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
the same validator with its expected metadata. Current receipts belong in
ignored `output/`; the [release plan](../22-release-readiness.md) tracks pending
browser/Cloud and dependency gates. This is the current contract; the long
numbered export/API designs contain historical proposals.
