---
"@gotipe/markdown": patch
---

The indentation of the first line of a block stays with the block.

The snapshot keeps the blanks before the first line of a block at the end of the gap before it,
and the writer used to leave them there when the gap was no longer the block's own:

- deleting the block in front of indented code, or the first block of the file before it, turned
  the code into a paragraph;
- a block inserted before indented code that starts the file took the code's indentation and
  was read as code, and the code as a paragraph;
- editing indented code after a blank line wrote its fence indented, and the fence line was read
  as code;
- an indented paragraph after an edited list went into the last item of the list.

The blanks now move with the block. An untouched block keeps them wherever they leave it a block
of its own, and drops them elsewhere when it reads the same without them; blanks before raw
source count as needed. A rewritten block is written without them. When an untouched block would
go into the block before it or lose its blanks, the block before it takes back the blanks of its
own source if it reads the same with them. Failing that, an untouched block that needs its blanks
is rewritten, as with indented code after a list or after other indented code: indented code
becomes a fenced block. A list rewritten that way takes a marker other than that of a list next
to it.
