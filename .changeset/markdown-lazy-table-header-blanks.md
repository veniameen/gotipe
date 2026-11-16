---
"@gotipe/markdown": patch
---

A lazy line that heads a table counts its blanks as on GitHub.

GitHub (cmark-gfm) keeps a lazy line of a quote or a list item in the paragraph with the blanks it
has there, and blanks before a leading `|` make one more cell. Both readers now do the same:
`> x`, `  a | b`, `> --|--` reads as a quote holding the paragraph `x` and a table, where it was one
paragraph; `-   x`, `  | a |`, `    |---|` reads as an item with one paragraph, where it was a
paragraph and a table; `> x`, `  | a |`, `> |---|---|` reads as a table whose first head cell is
empty. A list item no longer strips the indentation of a lazy line, so the quote around it no
longer ends before such a line (`> - x`, `  | a |`, `>   |---|` is one quote), and a lazy line
after a definition stays in its quote (`> [a]: /u`, `  foo`). What the writer writes does not
change.

The Rust converter (`gotipe-convert`) reads the same blocks on the shared cases.
