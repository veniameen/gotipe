---
"@gotipe/core": patch
---

`insertToggle()` inserts a toggle with an empty summary, as the other insert commands insert
empty blocks (D-15). Before, the summary was the English text "Toggle heading" whatever the
interface language was. The React view shows the empty summary's placeholder in the interface
language («Toggle», «Раскрывающийся блок»); the toggle is still open, with an empty paragraph
inside.
