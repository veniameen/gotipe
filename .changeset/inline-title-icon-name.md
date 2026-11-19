---
"@gotipe/block-editor": patch
"@gotipe/theme": patch
---

The page title with an inline icon (`iconPlacement="inline"`): its accessible name is the title's
text alone (the prompt when it is empty), no longer prefixed by the icon's own name, and the empty
title's prompt starts after the icon instead of under it (`--gt-page-icon-inline` +
`--gt-page-icon-inline-gap`, as the text).
