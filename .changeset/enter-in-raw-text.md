---
"@gotipe/core": patch
---

Enter in a formula starts a new line in its TeX source, as in a code block, instead of
splitting the formula into two math blocks (D-11).

- The same holds for every block whose node type declares `content: "rawText"`, your own
  types included: Enter there is a line break, also when the browser reports it as
  `insertLineBreak`. In an editor without a schema, a block that holds a string takes it so.
  Shift+Enter is unchanged.
- Escape in a top-level formula adds an empty paragraph after it and moves the caret there, as
  in a code block. It now works without the `CodeBlock` extension and with a view of your own
  that has no `<pre>`. Tab and Shift+Tab still need `CodeBlock`.
