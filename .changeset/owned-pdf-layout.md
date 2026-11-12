---
"@gotipe/export": patch
"@gotipe/export-wasm": minor
---

Replace the Typst compiler with GoTipe's own PDF layout and renderer while retaining
the public export API. Use maintained PDF serialization, shaping and font-subsetting
libraries; preserve original bundled Unicode fonts and their license notices.
Remove the unpublished citationberg patch and unmaintained compiler dependencies.

Support A4, Letter and Legal page sizes, validated margins/font sizes, page headers
and footers, Unicode text, inline formatting, links, images, nested lists and merged
tables. Fix long-text/code wrapping and preserve explicit errors for unrepresentable
text. Verify the shared native/browser implementation with an independent fixed
PDF corpus, geometry/text/object checks and Cloud conversion acceptance.

Preserve heading bookmarks, tagged document structure, logical reading order,
image alternative text, table/list semantics and XMP metadata across the replacement.
Split oversized table rows across available page space and reject content that a
container cannot represent instead of silently discarding it.
Keep word selection bounds and emoji variation sequences accurate while retaining
logical Unicode text for copying and assistive readers.
