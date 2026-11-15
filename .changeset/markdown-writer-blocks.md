---
"@gotipe/markdown": patch
---

Blocks inside list items, toggles, columns and quotes read back as they were written.

- A child that writes no line — a paragraph without text, raw source of blanks, a list without
  items — is not written, at the top level a list without items neither. Its blank line after the marker of an item without text ended the item,
  and the item lost the blocks after it (`-`, a blank line, `  - x`); in a loose list the writer
  no longer puts a blank line right after such a marker either.

The Rust converter (`gotipe-convert`) writes the same bytes on the shared cases
(`crates/gotipe-export/tests/fixtures/markdown-writer-blocks.json`):

- The children of a toggle, columns, a paragraph, a heading and other blocks follow a blank line,
  as in the TS writer; a paragraph child was read as more text of the block (`T` and its child
  `c` as `T c`). An empty code block is its two fences.
