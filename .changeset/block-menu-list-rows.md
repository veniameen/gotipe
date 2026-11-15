---
"@gotipe/block-editor": patch
---

The block menu acts on the block its grip moves. On a list row — bullet, numbered or to-do,
nested or inside a column — Delete removes that row with its nested rows (a list's only row
takes the emptied list with it) and Duplicate puts a copy with new IDs into the same list;
before, both changed the whole list. A block inside a row (a paragraph after the row's text)
belongs to that row for `+`, the grip and the menu. Turn into and Reset formatting apply to that
row too and lift it out of the list. A column that Delete or dragging out its only row leaves
without blocks gets an empty paragraph. Reset formatting now also removes the marks of the text — bold,
colours, links — and keeps mentions, formulas and custom emoji, which are content. A block with
children (a toggle, a callout) keeps its type and loses only the marks, instead of failing; a
block without text of its own (an image, a divider, a table) is left alone instead of becoming an
empty paragraph or failing. Each action is one undo step. `BlockToolbar` passes `dragBlockId` to `BlockContextMenu`.
