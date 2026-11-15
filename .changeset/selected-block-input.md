---
"@gotipe/core": patch
---

Typing a character or Enter on a block selected as a whole (`selectBlock()`, the block handle)
acts on the selected block whenever it comes (D-180): the block is replaced, as Backspace and
Delete delete it. Before, once the caret restore had run, `beforeinput` read the DOM caret at
the block's start instead, and the text went into the block. A caret the user puts elsewhere
still takes over.
