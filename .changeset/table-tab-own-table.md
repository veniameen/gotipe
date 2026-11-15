---
"@gotipe/core": patch
---

Tab and Shift+Tab in a table stay in that table. `goToNextCell()` and `goToPrevCell()` move
between the cells of the table that holds the caret (its nearest `table` ancestor), row by
row; in its last or first cell they do nothing and `run()` returns `false`, so the key keeps
its browser meaning instead of jumping into the next or previous table of the document.
