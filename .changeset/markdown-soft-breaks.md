---
"@gotipe/markdown": minor
---

Line breaks follow CommonMark. A soft line break, a plain line ending inside a paragraph, quote,
callout or list item, was kept as `"\n"` and drawn as a visible break, while GitHub and every
other renderer show a space; a line ending inside inline code was kept as well.

- **Reading.** A soft break is a space and a line ending in inline code is a space; a hard break
  (`\` or two spaces before the line ending) is `"\n"`, as before. A setext heading over two lines
  is one line of text. The reader no longer sets `breaks: "hard"`.
- **Writing.** Every `"\n"` of a paragraph, quote, callout or list item is written as a hard
  break, `\` before the line ending (`&#10;` at the start or end of the text), so a line break
  typed in the editor survives a round trip and shows in other renderers too; `breaks` is
  ignored. Headings and table cells keep `<br>`.
- **Lines of an edited block.** The writer reads the old source of an edited block from the
  snapshot and writes a space back as the line ending it was while the words around it are still
  there, so an edit rewrites only the lines it touches; `PageEditor` and every host that passes the
  returned snapshot keep the file's line wrapping. A block new to the file is written on one line.
- A link whose text is a hard break alone is a link, not raw source, and a GitHub alert is found
  when its `[!KIND]` line ends with a soft break.

The native reader and writer of GoTipe Cloud (`gotipe-convert`) do the same, byte for byte on the
shared cases (`crates/gotipe-export/tests/fixtures/markdown-line-breaks.json`).
