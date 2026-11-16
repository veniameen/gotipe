---
"@gotipe/markdown": patch
---

A table whose head row is a lazy line of a quote or a list item is read as a table, as on GitHub.

A line without the quote's `>` (or without the item's indentation) that continues a paragraph can
now head a table when a delimiter row with as many cells follows: `> x`, `| a |`, `> |---|` reads as
a quote holding the paragraph `x` and a table, where it was one paragraph of three lines. The quote
or the item no longer ends before such a line. A lazy line with blanks before its text still does
not head a table: GitHub keeps those blanks in the row, where before `|` they make one more cell.
What the writer writes does not change.

The Rust converter (`gotipe-convert`) reads the same blocks on the shared cases.
