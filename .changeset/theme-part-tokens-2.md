---
"@gotipe/theme": patch
---

More part tokens for a host, each with today's look as its default:

- Tables: `--gt-table-line`, `--gt-table-row-rule`, `--gt-table-col-rule` and `--gt-table-frame`
  for the grid; `--gt-table-head-size`, `-leading`, `-weight`, `-color`, `-fill` and
  `--gt-table-head-line` for header cells; `--gt-cell-first-pad`, `--gt-table-row-height`;
  `--gt-table-code-size`, `--gt-table-code-pad`, `--gt-table-code-fill` for inline code in a
  cell; `--gt-table-shared-layout: auto` sizes columns without a stored width by their content.
- The reset that drops the line under a table's last row weighs as much as the cell rule, so a
  host's own border rule on the cells wins over it.
- Flow: `--gt-flow-after-h1-table`, `-h2-table`, `-h3-table` before a table under a heading,
  `--gt-flow-between-lists` before a list that follows a list, `--gt-list-item-gap` between items.
- Suggestions: `--gt-sug-ins-line-mix`, `--gt-sug-block-ins-tint`,
  `--gt-sug-block-ins-underline(-thickness)`, `--gt-sug-stale-color`, `--gt-sug-stale-line`,
  `--gt-sug-stale-underline-style`, `--gt-sug-stale-underline-thickness`,
  `--gt-sug-stale-active-fill` and `--gt-sug-stale-check-line`.
