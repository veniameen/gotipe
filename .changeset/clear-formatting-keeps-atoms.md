---
"@gotipe/core": patch
---

`clearFormatting()` removes only formatting. Mentions, inline formulas, custom emoji and inline
images keep their atomic marks, on both engines: Clear Formatting in the More menu of
`@gotipe/block-editor` no longer turns a mention into the text `@Anna`, a formula into its TeX
or an inline image into its caption. Bold, colours and links on the atoms are still removed.
