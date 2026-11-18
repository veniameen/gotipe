# @gotipe/wasm

## 0.1.2

### Patch Changes

- ec77da1: `editor.batch(fn)` makes every change committed while `fn` runs one undo step, on both
  engines and with collaboration: Undo restores the document and the selection from before
  the first change, Redo restores all of them. Events and filters still run per transaction;
  a nested batch joins the outer one; typing before and after a batch stays a step of its own.
  `@gotipe/wasm` joins a change marked `metadata.typing: "group"` to the open step of its
  collaboration history.

  `PageEditor`'s `insertBlock` from the title and the image and file blocks that replace an
  empty paragraph are one undo step; they used to take two.
