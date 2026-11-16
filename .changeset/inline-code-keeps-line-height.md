---
"@gotipe/theme": minor
---

A line with inline code or with TeX that cannot be read keeps the height of the other lines, as the
GoTipe Atlas now draws it (D-225). Their smaller monospace type took the paragraph's line height in
px and pushed the line down: in `notion` and `modern` such a line was 26 px instead of 24 in Chrome,
in `docs` and `minimal` 23 instead of 22. Inline code and broken TeX now set their type at the new
token `--gt-inline-code-leading` (`1`); the plate under them is drawn over the glyphs as before, so
it does not change. A host that wants the old look sets `--gt-inline-code-leading: inherit`.
