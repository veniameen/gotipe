---
"@gotipe/block-editor": patch
---

The block menu acts on the block its grip moves. On a list row — bullet, numbered or to-do,
nested or inside a column — Delete removes that row with its nested rows (a list's only row
takes the emptied list with it) and Duplicate puts a copy with new IDs into the same list;
before, both changed the whole list. Turn into and Reset formatting apply to that row too and
lift it out of the list. Reset formatting now also removes the marks of the text — bold,
colours, links — and keeps mentions, formulas and custom emoji, which are content. Each action
is one undo step. `BlockToolbar` passes `dragBlockId` to `BlockContextMenu`.
