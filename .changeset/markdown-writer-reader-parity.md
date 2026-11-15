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
- An item of a bullet list with a `checked` attribute, the task of the Rust editor, is written as a
  task (`- [x] a`) and keeps its mark; it was written as a plain item. A change of that mark after
  reading rewrites the list instead of keeping its old source.
- A block without syntax of its own that writes nothing — a toggle or columns without text whose
  blocks are empty — is left out at any depth, as an empty paragraph is. At the top level it was
  written as an empty line between two blank ones; between two lists with one marker it joined
  them into one list, and in an item without text its blank line took the item's blocks out of it.
- A paragraph or heading without text at the top level keeps the blocks under it: both writers
  left it out together with them.
