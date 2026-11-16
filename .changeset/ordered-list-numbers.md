---
"@gotipe/react": patch
"@gotipe/vue": patch
"@gotipe/theme": patch
---

An ordered list counts from its own number: React now renders `start` on `<ol>` (Markdown and the
document always kept it), and Vue keeps a list that starts at zero. A list whose numbers reach
three digits or more gets a digit's more room before its text for each extra digit
(`--gt-number-digit`; the renderers set `--gt-list-digits`), so «100.» no longer reaches into the
gutter where the block handle stands.
