---
"@gotipe/core": patch
---

A key pressed right after an edit acts where the edit left the caret (D-132). When the
renderer rewrote a text node after typing, the browser's caret stood at the start of that
text until the next frame, and a key in between used it: Backspace right after typing in a
list item turned the item into a paragraph, paste went to the start of the text, and WebKit
ignored Backspace in the first block of the document. The editor now puts the caret back as
soon as the renderer has drawn — it watches text changes as well as replaced nodes — and
until then Backspace at the start of a list item reads the editor's caret, as typing, Enter
and Delete already did. Typing itself is unchanged, and `getDOMSelection()` reports the right
caret right after an edit. A renderer of your own should draw a change before the next event,
synchronously or in a microtask.
