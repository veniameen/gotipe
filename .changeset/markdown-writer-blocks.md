---
"@gotipe/markdown": patch
---

Blocks inside list items, toggles, columns and quotes read back as they were written.

- A block that writes no line — a paragraph without text, raw source of blanks, a list without
  items — is not written, as a child or at the top level. Its blank line after the marker of an
  item without text ended the item, which lost the blocks after it (`-`, a blank line, `  - x`),
  and between two lists with one marker it kept them from being told apart, so they were read
  back as one list. In a loose list no blank line follows the marker of an item without text.
- Every line of raw source inside a list item or a quote (HTML, a list kept as written) is written
  with the item's indentation and the quote's `>`. Only its first line had them, so the rest left
  the item or ended the quote.
- A divider right under a line of a list item is written `***`: `---` there turned the text above
  it into a heading.
- In a tight list item, a block that would continue the text before it — a paragraph, a link line,
  a table, a `$$` formula or raw HTML right under the item's text, after a nested list or after a
  quote — is written after a blank line. It was read as more text of the item or of the last
  nested item (`- x`, `  - a`, `  p` as the item `a p`). The editor's lists cannot hold such an
  item, so the list now reads back as raw source instead of losing the block into the text.
- Raw source that only the end of the file ends (`<pre>` without `</pre>`, `<!--` without `-->`)
  gets its end before the next block inside a toggle, columns, a list item or a quote too, as at
  the top level; it took in the blocks after it. Written last in the file, it gets no line ending
  after it: the reader took that line ending in, and each writing and reading added a line.
- A paragraph read from a line of its own `$$` without a closing one (text `$$ x`) is written with
  `$$` and its next word on one line once it is edited, and also untouched where a later line of
  its own `$$` now follows it in the file; that line made a formula of everything in between.

The Rust converter (`gotipe-convert`) writes the same bytes on the shared cases
(`crates/gotipe-export/tests/fixtures/markdown-writer-blocks.json`):

- The children of a toggle, columns, a paragraph, a heading and other blocks follow a blank line,
  as in the TS writer; a paragraph child was read as more text of the block (`T` and its child `c`
  as `T c`). An empty code block is its two fences, a heading without text its `#` alone.
- A loose list keeps its blank lines between items and before the children of an item; it was
  written tight and read back as a tight list.
