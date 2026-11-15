---
"@gotipe/theme": patch
---

Headings and the page title wrap balanced, as the GoTipe Atlas draws them (D-150): a heading of
two lines no longer ends with one lone word. `--gt-heading-wrap` now applies to every heading —
`balance` in `notion`, `modern` and `minimal`, `pretty` in `docs`, where a balanced heading would
carry its anchor away; the title of `BlockEditor` and of `PageEditor` wraps balanced in every view.
Browsers without `text-wrap: balance` or `pretty` wrap as before.
