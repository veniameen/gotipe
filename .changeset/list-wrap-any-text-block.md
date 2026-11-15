---
"@gotipe/core": patch
---

`toggleBulletList()`, `toggleOrderedList()` and `toggleTodoList()` (and the `set…List()`
variants) wrap any block whose type holds text by its schema, rich or raw (D-143): a formula,
a toggle or a node of your own becomes the list's only item with its text and child blocks,
as a paragraph or heading did. Before, such a block turned into an empty list and its text was
lost, and a toggle with children failed with `VALIDATION_ERROR`. A block without text, such as
an image or a divider, now stays as it is instead of becoming an empty list.
