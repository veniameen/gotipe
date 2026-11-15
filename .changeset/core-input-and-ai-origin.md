---
"@gotipe/core": minor
"@gotipe/ai": minor
"@gotipe/block-editor": patch
---

`@gotipe/core`: the `update` event carries `origin` — `"remote"` for another replica's
update and the repair after it, `"local"` for everything else. New event `aiReviewChange`.
An IME composition goes on with the typing undo step, and the pause before it counts from
`compositionstart`, so Korean text is no longer undone a syllable at a time. Backspace and
Delete remove a block selected as a whole (`selectBlock`), a list item too. A paste right
after an edit that the renderer has not drawn yet goes to the model's caret.
`autofocus: "start" | "end"` places the caret; `focus("start" | "end")` uses the first or
last block with text, list items included, and publishes the selection change.

`@gotipe/ai`: a collaborator's edit no longer cancels the running request. Results check
only the blocks they apply to; proofreading and review drop results for blocks a
collaborator changed meanwhile. AI review comments emit `aiReviewChange` instead of
`commentAdded` and `commentDeleted`. `AiOptions.commands`, which nothing read, is removed.

`@gotipe/block-editor`: the AI command bar closes after a review on `aiReviewChange`.
