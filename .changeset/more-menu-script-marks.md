---
"@gotipe/block-editor": patch
---

The bubble's More menu offers Superscript and Subscript only when the editor has those marks
(`FullPreset` does, `DefaultPreset` does not); before, they were always there and failed with
an error.
