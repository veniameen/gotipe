---
"@gotipe/theme": patch
---

A line with a mention or a team's emoji keeps the height of the other lines, as the GoTipe Atlas
draws it (frames 22 and 23, D-200). The atom's hidden document text stays in the line at zero size
but no longer takes the paragraph's line height, which stood it a line high on the baseline and
pushed the line down: in `notion` a line with a mention is 24 px again instead of 30. A team's emoji
now sits on the line as in the Atlas, its foot 0.24em below the baseline; before, its line was twice
as high, the image stood about 14 px above its place and the fill under the pointer was as tall as
the line. TeX that cannot be read no longer pushes its line down either; its smaller monospace
type still makes the line a pixel or two higher, as inline code does.
