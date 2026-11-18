---
"@gotipe/block-editor": patch
"@gotipe/theme": patch
---

`PageEditor`'s `iconPlacement: "above" | "inline"` (default `"above"`): `"inline"` draws the page's
glyph in the title's row before its text (`.gotipe-page-title-icon`, `--gt-page-icon-inline`,
`--gt-page-icon-inline-gap`), outside the title's text and the file. `createPageBlockViews` takes
`titleIcon`.
