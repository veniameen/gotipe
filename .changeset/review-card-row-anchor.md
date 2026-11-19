---
"@gotipe/block-editor": patch
"@gotipe/theme": patch
---

A suggestion that edits a list item opens its card at that row's marks (`.gotipe-sug-del`,
`.gotipe-sug-ins`) instead of at the whole changed list; a block stands for the card only when the
text has no mark. `--gt-review-card-gap` (8 px) sets the card's space to its row above or below it.
