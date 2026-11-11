---
"@gotipe/core": minor
"@gotipe/react": patch
"@gotipe/theme": minor
"@gotipe/block-editor": minor
---

Draw the editor's interaction from the GoTipe Atlas (frames 6–8).

- `@gotipe/core` exports the document palette: `DOCUMENT_TEXT_COLORS`,
  `DOCUMENT_HIGHLIGHT_COLORS` and `documentColorStyle(value)`. A colour mark still stores
  a plain colour (the light print value), so exports keep it; an editor renders a palette
  value through its theme token (`--gt-tc-*`, `--gt-bg-*`), so marks follow light and dark.
  Values of the earlier palette with an equivalent render the same way. `@gotipe/react`
  renders text and highlight colours through it.
- The colour picker offers the Atlas palette — text gray, red, amber, green, blue;
  backgrounds yellow, green, blue, red, gray — as one row of swatches; purple and orange
  are gone from the palette (documents keep the colours they have).
- The bubble, block type menu, link field, colour row, more menu, block menu and
  «Turn into» share one overlay surface (`theme/overlay.css`) and the GoTipe icons instead
  of letters and emoji. An invalid link only highlights the field; its message stays for
  screen readers.
- The slash menu shows quiet group labels, 16 px icons and the Markdown shortcut of each
  block. Drag shows a trace of the block and an accent line with a dot where it lands.
