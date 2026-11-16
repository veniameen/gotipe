---
"@gotipe/markdown": patch
---

An untouched toggle, columns or paragraph with children no longer joins a new list next to it.

With a snapshot, a block whose id and content match it is written as its source again. A block
whose children are written after it at its own level (a toggle, columns, a paragraph that has
children) was then one opaque neighbour to the protection of list markers: when its source started
with `- x` and a new list `- a` was put before it, or ended with a list and a new list with the same
marker followed, the two lists were read back as one. Such a block is now written again whenever a
neighbour is not written as its source, and the markers are chosen as without the snapshot. Its
source always comes from the writer, so nothing typed by hand is lost; with untouched neighbours it
keeps its bytes.

The Rust converter (`gotipe-convert`) writes the same bytes on the shared cases.
