---
"@gotipe/theme": patch
---

A table without column widths no longer grows as wide as its longest line. The theme sized every
table for editing (`table-layout: fixed; width: max-content`), which needs a `<col>` width per
column; the editor draws one (the stored width, 160 px without one), but the HTML of
`serializeHtml`, a server render and the version comparison of `@gotipe/block-editor` have none,
so a table read from Markdown with long text ran thousands of pixels past the column. Such a table
now fits the column: its columns share the width by their content and the cells wrap
(`overflow-wrap: break-word`); words that cannot fit scroll it inside `.gotipe-table-wrapper`.
Tables with widths, resizing and the editor's scrolling area are unchanged.
