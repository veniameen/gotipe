---
"@gotipe/block-editor": patch
"@gotipe/theme": patch
---

`PageEditor`'s `reviewLaneCursor?: "caret" | "pointer"` (default `"caret"`, today's caret with a
flag): `"pointer"` draws a lane's cursor as an arrow pointer at the same place, its name chip below
right of the tip, in the lane's colour (`.gotipe-lane-cursor[data-variant="pointer"]`,
`.gotipe-lane-pointer`). Tokens `--gt-lane-pointer-size` (16 px), `--gt-lane-pointer-chip-x`
(10 px), `--gt-lane-pointer-chip-y` (14 px), `--gt-lane-pointer-chip-radius`
(`var(--gt-radius-inline)`). `ReviewLayer` takes `laneCursor`; type `ReviewLaneCursor`; `PageIcon`
has a `pointer` glyph.
