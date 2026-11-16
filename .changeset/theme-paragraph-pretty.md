---
"@gotipe/theme": patch
---

Paragraphs wrap with `text-wrap: pretty`, as the GoTipe Atlas sets them (D-201): the last line of a
paragraph is no longer one lone word where the browser can avoid it — before, the theme wrapped
paragraphs greedily. Browsers without `pretty` (Firefox) wrap as before.
