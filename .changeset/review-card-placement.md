---
"@gotipe/block-editor": patch
---

`PageEditor`'s `reviewCardPlacement?: "below" | "above"` (default `"below"`, today's behavior):
where a review card by the text opens when there is no room beside it. `"above"` opens it above
the row, below it when the window has no room above. `ReviewLayer` takes `cardPlacement`; type
`ReviewCardPlacement`.
