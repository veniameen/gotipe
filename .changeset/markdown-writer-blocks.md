---
"@gotipe/markdown": patch
---

Blocks inside list items, toggles, columns and quotes read back as they were written.

- A child that writes no line — a paragraph without text, raw source of blanks, a list without
  items — is not written, at the top level a list without items neither. Its blank line after the marker of an item without text ended the item,
  and the item lost the blocks after it (`-`, a blank line, `  - x`); in a loose list the writer
  no longer puts a blank line right after such a marker either.
- Every line of raw source inside a list item or a quote (HTML, a list kept as written) is
  written with the item's indentation and the quote's `>`. Only its first line had them, so the
  rest left the item or ended the quote.
- A divider right under a line of a list item is written `***`: `---` there turned the text above
  it into a heading.
- In a tight list item, a block that would continue the text before it — a paragraph, a link
  line, a table, a `$$` formula or raw HTML right under the item's text, after a nested list or
  after a quote — is written after a blank line. It was read as more text of the item or of the
  last nested item (`- x`, `  - a`, `  p` as the item `a p`). Such an item has blocks the editor's
  list cannot hold, so the list now reads back as raw source instead of losing the block into the
  text.

The Rust converter (`gotipe-convert`) writes the same bytes on the shared cases
(`crates/gotipe-export/tests/fixtures/markdown-writer-blocks.json`):

- The children of a toggle, columns, a paragraph, a heading and other blocks follow a blank line,
  as in the TS writer; a paragraph child was read as more text of the block (`T` and its child
  `c` as `T c`). An empty code block is its two fences.
- A loose list keeps its blank lines between items and before the children of an item; it was
  written tight and read back as a tight list.
