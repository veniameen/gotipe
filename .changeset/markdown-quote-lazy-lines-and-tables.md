---
"@gotipe/markdown": patch
---

Lines after quotes, link reference definitions and tables are read as CommonMark and GFM read
them.

- A line without `>` after a quote stays in it only as more of the text of a paragraph the quote
  has open. Any list item ends the quote, an empty one or one numbered not from 1 too (`> a`, then
  `*`); a line after a table or code in the quote is read after the quote, and a line after
  indented text in a paragraph of the quote continues that paragraph.
- A link reference definition is paragraph text: the line right after it continues that text
  unless it interrupts a paragraph (`[a]: /u`, then `2. x` is a paragraph, not a list from 2).
- A run of `-` without `|` under a table row is the underline of a heading, not a one-column
  table; a list item, HTML or indented code ends a table.
- A line without indentation after a blank line inside a list item continues the paragraph the
  item has open (`- a`, blank line, `  b`, then `c`).
- Quotes and list items nested many levels deep, each ended by such a line, are read in time that
  grows with the depth; each level read its content twice in turn.

The Rust converter (`gotipe-convert`) reads the same, and now also ends a colour or another inline
HTML mark at its own end tag when a plain tag of the same name is nested in it.
