---
"@gotipe/markdown": patch
---

An edited block no longer runs into the block after it.

- **Gaps without a blank line.** Between two blocks that were neighbours in the file, the writer
  keeps the file's gap without a blank line only while the two read the same with it as with a
  blank line. A quote whose source ended with an empty `>` line kept the next paragraph out of
  the quote only by that line: once the quote was edited, the paragraph was read as part of the
  quote. Such blocks are now separated by a blank line; the same goes for a callout, a quote
  before indented code and a table written as HTML after its cells were merged. An untouched
  block keeps the blanks before its first line where it needs them, as indented code does, and a
  rewritten block is written without them.
- **Tasks without text.** A nested list that cannot interrupt a paragraph (numbered from another
  number than 1, or starting with an empty item) follows a blank line under a task without text
  too: the `[ ]` of the task is text, and `2. a` right below it was read as the task's text.

The native converter of GoTipe Cloud (`gotipe-convert markdown`) lays out blocks as
`serializeMarkdown` does without a snapshot: empty paragraphs and headings are left out, a
divider that starts the file is written as `***` so that it does not open front matter (the text
up to the next `---` was lost), of two neighbouring lists with one marker the later one takes
another marker (they were read as one list), a nested list that cannot interrupt the text of its
item follows a blank line at any depth, an item without text is its marker alone, and `start` is
read as this package reads it. Both writers write the same bytes on the shared cases
(`crates/gotipe-export/tests/fixtures/markdown-write-read.json`).
