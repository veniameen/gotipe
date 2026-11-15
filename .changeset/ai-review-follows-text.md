---
"@gotipe/ai": patch
---

AI review comments survive edits that do not touch them (D-181). Before, any `update` — your
edit anywhere in the document or a collaborator's first character — removed every comment of
the review. Now each comment follows the text of its block: an edit before its quote, local
or another replica's, shifts its `from` and `to`; an edit elsewhere leaves it; it goes only
when the edit touches its quote or removes its block. Every change emits `aiReviewChange`,
and `getAiReviewComments(editor)` returns the moved comments.
