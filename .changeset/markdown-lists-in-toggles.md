---
"@gotipe/markdown": patch
---

Lists inside a toggle, columns or a paragraph without text no longer join the list next to them.

A block without syntax of its own and without text (a toggle, columns, a paragraph that only has
children) is written as its children. When its first child was a list with the marker of the list
before it, the two were read back as one list: `- a`, a toggle holding `- x`, `- b` came back as
one list of three items. The same happened to a list after a block whose last child is a list, and
among the children of a list item. The protection of list markers now looks at the blocks as they
are written one after another, so the inner list takes another marker (`- a`, `* x`, `- b`) and
each list reads back on its own.

The Rust converter (`gotipe-convert`) writes the same bytes on the shared cases.
