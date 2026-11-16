---
"@gotipe/theme": patch
---

A click past the end of a line that ends with a mention puts the caret after the mention (D-240).
Chrome looked for the caret inside the mention's drawing, found no place there and left the caret
where it was: in another block, or at the start of the paragraph when the editor had no focus, so
the next typed or composed text went there. A mention is now one box of the line, as the GoTipe
Atlas draws it in frame 22 (`display: inline-flex` on `.gotipe-mention`). The fill under the
pointer is now as high as the line, as in the Atlas (24 px in `notion` instead of 18); the line
keeps its height. Text composed with an IME right after a mention, a formula or a team's emoji
lands after it, with the caret after the text, and is now checked in Chrome (D-226).
