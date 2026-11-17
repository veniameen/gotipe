---
"@gotipe/comments": patch
---

A comment follows its quote when you type right next to it (D-290). Before, a comment was found
again only by its quote with up to eight characters on each side, so text typed directly before
or after the quote, or at the start of its block when the quote opened the block, marked it
orphaned although the quoted text was still there. Now each edit is read from the text before
and after it, and a comment follows any edit that leaves its quote whole; the stored anchor takes
the new surroundings, so a reload finds the quote too. An edit inside the quote or its removal
still orphans the comment, and Undo brings it back.
