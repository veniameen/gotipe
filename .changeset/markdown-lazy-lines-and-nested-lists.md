---
"@gotipe/markdown": patch
---

Lines after list items, verbatim text in merged cells and lists inside items and quotes read back
as they were written.

- A line without indentation right after a list item is read as part of the item only when it
  continues the text of the item, as in CommonMark. After an empty item (`-`, then `b`), an empty
  nested item, a heading, code, HTML, a table or an empty quote it is read as the block after the
  list, not as the text of the item. A table delimiter row is never such a line: `- | a |`, then
  `| - |`, is text of the item, as in GFM.
- Text kept verbatim (`mdRaw`, such as `![i](u.png)` or inline HTML) in a table with merged cells,
  which is written as an HTML table, is written as escaped text in a `<span>` of its own and read
  back verbatim. It was written as plain text and read back without its mark.
- The blank lines of a list inside a quote or a callout (between the items of a loose list, before
  a nested list that needs one) are written with the quote's `> `, so the quote no longer ends
  there and reads back as one block.
- Of two neighbouring lists with one marker inside an item, a quote or a callout, the later one is
  written with another bullet or numbering delimiter, as at the top level; two raw lists there get
  the protection of the top level too. They were read back as one list.

The Rust converter (`gotipe-convert`) reads and writes the same, and writes the same bytes on the
shared cases (`crates/gotipe-export/tests/fixtures/markdown-nested-write-read.json`).
