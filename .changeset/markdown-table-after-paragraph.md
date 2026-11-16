---
"@gotipe/markdown": patch
---

A table right under a paragraph is read as a table, as on GitHub.

A line followed by a table's delimiter row with as many cells now ends the paragraph above it and
heads a table: `x`, `| a | b |`, `|---|---|` reads as the paragraph `x` and a table, where it was
one paragraph of three lines. The head row starts no other block (a link reference definition,
indented code, a list not starting at 1). As on GitHub, once a delimiter row under a line of the
paragraph did not match that line, the rest of the paragraph is not checked for a table. A list
item or a quote that holds such a table is kept as its source, as other blocks the editor's lists
and quotes cannot hold. What the writer writes does not change: lines of text that look like a
delimiter row were already escaped.

The Rust converter (`gotipe-convert`) reads the same blocks on the shared cases.
