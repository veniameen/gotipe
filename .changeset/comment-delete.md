---
"@gotipe/block-editor": minor
"@gotipe/i18n": minor
---

A comment can be deleted from its card. `PageReviewProps.onDeleteComment(id)` adds a trash
button at the end of the open comment card's head, labelled "Delete comment" (`review.deleteComment`,
Russian included). Ask for confirmation inside the callback if you need it: `false` keeps the
card, a throw is reported as `COMMENT_ACTION_FAILED`, and after success drop the comment from
`comments`. Without the callback the card is unchanged.
