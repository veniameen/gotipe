---
"@gotipe/markdown": patch
---

A block that the end of its file closed, and a raw list next to a raw list with the same marker,
no longer take in the block next to them.

- A fenced code block (a ```` ```math ```` fence too) without its closing fence, and HTML that
  ends only at its own end (`<pre>`, `<script>`, `<style>`, `<textarea>`, a comment, `<?`,
  `<![CDATA[`, a declaration) without that end, run to the end of the file. When an edit put a
  block after such a block, the writer copied it as it was and the new block was read as part of
  it. Now the writer adds its end where another block follows: the fence of its opening line, or
  the end of the HTML on a line of its own. A code block reads back the same; raw HTML reads back
  with the added line.
- Two raw lists (multi-paragraph items, mixed tasks) with one marker that a deletion or a move put
  next to each other were read as one list: the writer changed the marker only of lists it writes
  itself. Now the items of the later raw list take another bullet or numbering delimiter, one under
  which it reads as the same list and, where possible, one the list after it does not use: a list
  with an item `* *` takes `+`, since `*` would make that item a thematic break. Where no marker
  keeps the later list as it was, the earlier list takes one. A raw list also takes another marker
  when the numbered list before it, which has only one other delimiter, would join the list before
  that one. Lists that were neighbours in the source and are written as their source keep their
  markers, so saving without an edit no longer rewrites them.

The Rust writer (`gotipe-convert markdown`) writes raw text that it copies as it is the same way.
