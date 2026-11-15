---
"@gotipe/core": minor
---

Undo takes back typed text a step at a time, not a character at a time (D-08).

- Text typed in a row in one block is one undo step, and so is text deleted with Backspace or
  Delete in a row. Before, every input event was its own step, so Undo took back one
  character and the 100-step history held the last 100 characters.
- The step ends after a pause of 500 ms, when the caret or the selection moves (also back to
  the same place) or typing goes to another block, when typing turns into deleting or back,
  and with any other change: Enter, a line break, paste, an input rule, a command or your own
  `dispatch`, a formatting toggle at the caret, Undo and Redo. Typing over selected text
  starts a step that the following typing joins, and deleting it one that the following
  deleting joins, also across blocks: one Undo brings the selected text back. A whole selected
  block, such as an image, is replaced or deleted in a step of its own.
- An IME composition is still one step of its own. `dispatch` is never grouped: every call is
  its own step, as before, even when it inserts one character at the caret.
- A transaction with `metadata: { addToHistory: false }` still adds no step, and it doesn't
  end the typing step either. Neither does a character a transaction filter rejects.
- The history keeps the last 100 steps; text typed in a row is one of them however long it is.
- Redo, commands and both engines are unchanged. With collaboration the CRDT history keeps its
  own grouping (by the same 500 ms pause, within one block).
