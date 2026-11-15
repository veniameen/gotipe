---
"@gotipe/core": patch
---

The JS engine rejects the steps the Rust engine rejects (D-03).

- A `deleteBlock`, `setBlockType`, `setBlockAttrs` or `removeMark` step for a block that
  doesn't exist now throws `TRANSFORM_ERROR` (`Block not found: …`). Before, it was skipped
  and left an empty undo step.
- A `removeMark` step on a block without rich text, such as code or math, throws `Invalid
  content type for this operation`.
- A `deleteText` step on a block whose content is `null` throws instead of giving it empty
  text.

In all of these the whole transaction is rejected, as on WASM, and both engines give the same
message. WASM said `Transform error: …` before. `addMark` and `insertText` for a missing block,
and `addMark` on a block that takes no marks, still fail schema validation with
`VALIDATION_ERROR` on both engines.

On the JS engine, a chain that stages the same block deletion twice now throws, as it did on
WASM. Chain commands read the document as the chain found it, so two `deleteBlock()` calls
both name the same block.

A chain's staged selection no longer outlives its block (D-07). A chain's own steps may
remove the block of a selection staged with `setSelection`, `selectAll` or `selectBlock`, or
shorten its text. The selection then moves as the caret does: into the block it was merged
into, to the start of the next remaining text block, or to the end of the text. Before,
`run()` threw `TRANSFORM_ERROR`. `chain().selectAll().deleteBlock().run()` and
`setSelection(…).mergeWithPrevious()` now work. Chains that only insert text, change marks or
attributes, or insert or move blocks keep their staged selection as before.
