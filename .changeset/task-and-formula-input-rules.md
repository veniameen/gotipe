---
"@gotipe/core": patch
---

Two Markdown shortcuts do what they say. `[x] ` at the start of an empty block makes a
checked task (`checked: true`); typed in an empty task, it checks that task instead of
taking the list apart. `$$` makes an empty formula: the two dollar signs no longer stay at
the start of its TeX source. Both engines behave the same.
