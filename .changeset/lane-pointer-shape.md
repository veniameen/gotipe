---
"@gotipe/block-editor": patch
"@gotipe/theme": patch
---

The pointer lane cursor (`reviewLaneCursor="pointer"`) is placed and drawn by the host:
`--gt-lane-pointer-at` (`0px`) sets where the tip stands in the row (`100%` is its bottom) and the
name chip moves with it; `--gt-lane-pointer-outline` (`currentColor`) and
`--gt-lane-pointer-outline-width` (unset: `--gt-icon-stroke`) outline the built-in arrow, for
instance in the page's colour. `PageEditor`'s `reviewLanePointer?: ReactNode` draws the host's own
arrow instead of the built-in one (`span.gotipe-lane-pointer`, in the lane's colour), and
`--gt-lane-pointer-tip-x`/`-tip-y` (unset: the built-in arrow's 3/16 and 1.75/16 of the size) say
where its tip lies in its box. Defaults draw the cursor as in 0.1.4.
