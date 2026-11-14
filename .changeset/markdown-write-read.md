---
"@gotipe/markdown": patch
---

Markdown written by GoTipe reads back as the same document.

- **Addresses in text.** Plain text such as `www.example.com`, `https://…` or
  `name@example.com` is written with the character that starts a GFM autolink escaped
  (`www\.example.com`, `https\://…`, `name\@example.com`), so it is no longer a link after a
  save. The reader takes an address only where the source writes its `www.`, its `scheme://` or
  its `@` as it is; an escape or a reference in the rest of an address stays part of it
  (`https://example.com/a\_b`). `www.` starts an address in lower case only, and leftovers such
  as `www.!` and `http://.` stay text (`www.!` was read as a link to `mailto:www`).
- **Line breaks in inline code.** A `"\n"` in code text is written as a hard break between two
  code spans, so the line break survives a save; the break itself has no code mark. `"\r\n"` and
  `"\r"` in text are line breaks (a lone `"\r"` was dropped), and so are `&#13;` and
  `&#13;&#10;` when read.
- **Edited blocks keep their lines as written.** Besides the place of each line ending, the
  writer keeps how the file spelled it: two trailing spaces or `\` of a hard break, blanks before
  a soft break, a lazy or deeper-indented continuation line. Only the lines an edit touches are
  rewritten.
- **Reading.** A GitHub alert whose marker line ends with blanks and `\` (`> [!NOTE] \`) no
  longer starts its text with a line break, and an alert with an address on its first line is an
  alert. A task whose text starts on the next line (`- [ ]`, then `  text`) has no leading space.
  Next to `*` or `~`, an emoji counts as punctuation and only CommonMark's whitespace counts as
  whitespace: `😀~~,~~` is struck through. A no-break space at the end of a heading or a table
  cell is text: only spaces and tabs are trimmed (a cell that started with a no-break space lost
  its last letter).
- **Checked rewrites.** A block is written in the first syntax that reads back as the block, and
  a line break of code or a `"\r"` no longer makes every rendering fail that check; a table
  without `align` (one the editor inserts) is checked too: `fingerprint` no longer tells a missing
  alignment from `null`. A formula with a line ending in it is written as text.
- **Link titles.** A line break in a link title is written as `&#10;`, so a blank line in it
  cannot end the paragraph.
- **Speed.** Writing a block takes time in proportion to its length: a paragraph of 100,000
  words is written in about 0.1 s instead of 30 s.

The native converter of GoTipe Cloud (`gotipe-convert`) reads as this package reads and writes
the text of a block as it writes it, byte for byte on the shared cases
(`crates/gotipe-export/tests/fixtures/markdown-write-read.json`): blanks at the edges of text and
table cells are kept, emphasis that cannot be delimiters is written as tags and the start of a
block is escaped.
