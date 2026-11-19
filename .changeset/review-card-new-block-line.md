---
"@gotipe/block-editor": patch
---

A proposed new block (a task or list item, say) opens its card at its text's lines
(`.gotipe-sug-block-ins-text`) rather than at the block's taller box, so `--gt-review-card-gap` is
measured from the text as for an edit's marks.
