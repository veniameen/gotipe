---
"@gotipe/theme": patch
"@gotipe/block-editor": patch
---

A page whose editor could not be created looks as the GoTipe Atlas draws it (frame 17, D-165): the
box "The document could not be opened" stands in the page's column, with the page's margins, as the
head and the quick blocks do — before, it took the whole width of the editor with no margins. Only
its warning glyph is red; the words are the quiet text colour, as on an image that cannot be shown.
`PageEditor` puts the words in their own `span` (`.gotipe-editor-error-text`); the alert, its text
and `data-gotipe-editor-error` are as before.
