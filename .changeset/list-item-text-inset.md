---
"@gotipe/theme": patch
---

`--gt-list-item-text-inset` (`0px`): a list item's content alone moves in from where it starts (its
text, and a task's box with it), while its dot and number stay, as `li { padding-left }` does;
`--gt-list-item-inset` still moves the whole item, its marker too. An empty item's prompt follows
the text.
