---
"@gotipe/core": patch
"@gotipe/wasm": minor
---

With collaboration, Undo takes back typing in the same steps as without it (D-130).

- `enableCollaboration` no longer changes what one Undo takes back. Before, the CRDT history
  joined every one-step `insertText` or `deleteText` in one block that came within 500 ms:
  typing and the Backspace after it were one step, a caret move inside the block didn't end
  the step, a line break, an IME composition and your own `dispatch` joined the typing around
  them, and typing over a selection was two steps, the first character and the rest.
- Now the editor's typing group decides the steps in both modes, by the D-08 rule: the step
  ends with a pause of 500 ms, a caret or selection move (also back to the same place),
  another block, a switch between typing and deleting and any other change. Typing over
  selected text is one step with the typing after it. A peer's edit elsewhere doesn't end
  your typing step.
- `@gotipe/wasm`: in collaboration, `WasmEditor.apply` joins a transaction to the undo step
  before it only when its `metadata.typing` is `"insert"` or `"delete"` and it comes within
  the history's 500 ms window; any other transaction is a step of its own. `@gotipe/core`
  sets the field for its own typing and drops a host's `metadata.typing`, so a `dispatch` is
  always a step of its own.
