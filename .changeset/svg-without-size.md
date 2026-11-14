---
"@gotipe/react": patch
"@gotipe/theme": patch
---

An image without a size of its own, such as an SVG with a `viewBox` and no `width` or `height`,
was drawn 0 px wide in the image block of `@gotipe/react/media` and in the read-only view of
`@gotipe/react`. It now fills the column until it is resized, and "Original size" gives it the
column's width instead of 0. Chromium reports a `naturalWidth` of 300 for such an SVG, so the
block finds it by its laid-out width once it has loaded; a column that is not laid out yet (a
hidden tab) is checked again when it gets a width.

**@gotipe/theme.** `.gotipe-image-loaded-shell[data-natural-width="none"]` fills the column.
