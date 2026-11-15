---
"@gotipe/core": patch
---

Typing `[] ` in an empty checked task unchecks it, as `[ ]` means in Markdown (D-137). Before,
the shortcut only removed what you typed and the task stayed checked, while `[x] ` checks an
empty task. The list and its other tasks are unchanged, and one Undo brings back the check and
the typed text. Both engines behave the same.
