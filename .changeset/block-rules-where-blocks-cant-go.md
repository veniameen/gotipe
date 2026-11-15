---
"@gotipe/core": patch
---

Markdown shortcuts that change a block (`- `, `* `, `1. `, `[] `, `[x] `, `> `, ```` ``` ````,
`$$`, `#`) no longer remove what you typed where their block can't go (D-128). In a table cell,
or in a column, toggle or quote that doesn't take that block, the shortcut now stays the text you
typed and nothing reaches `onError`; before, the trigger was deleted and the change failed with
`VALIDATION_ERROR` (`#` kept the text but still reported the error). Elsewhere the block changes
and the trigger goes in the same transaction, so one Undo brings the typed shortcut back as text;
before, the first Undo gave back the old block without the typed text. Both engines behave the
same.
