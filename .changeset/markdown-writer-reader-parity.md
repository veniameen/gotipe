---
"@gotipe/markdown": patch
---

The TS and Rust Markdown writers write the same bytes in more cases, and the readers read tables
as GFM does.

- Raw source inside a list item or a quote keeps the line endings it holds (`\r\n` and `\r` too),
  each followed by the item's indentation or the quote's `>`, the last one included. A quote no
  longer breaks in two after raw HTML whose source ends with a line ending: an empty line was
  written inside it. The Rust converter wrote a line after a lone `\r` without the indentation,
  which took it out of the item, and writes the lines of a code block with line feeds, as this
  package does.
