---
"@gotipe/react": patch
"@gotipe/block-editor": patch
---

The review card on a narrow page (`reviewCardPlacement`) is placed from its measured height:
`"above"` keeps the card's bottom 8 px above the row for any card (it used to assume 188 px, so a
short card hung far above its row and a tall one covered it), and `"below"` turns above the row by
the same measured rule when the window has no room below. `@gotipe/react`'s `FloatingPlacement`
gains `"top-start"`: above the anchor, aligned to its left edge, below it when there is no room.
