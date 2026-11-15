---
"@gotipe/core": patch
---

Typing `- `, `* `, `1. ` or `[] ` in an empty item of a list of the same kind no longer takes
the whole list apart (D-127). The rules called the toggles, and a toggle of the list's own
kind turns every item back into a paragraph, items with text included. Now they work like
`setBulletList()`, `setOrderedList()` and `setTodoList()`, as `[x] ` already did: the trigger
is removed, and the item stays an item of the same list, with the other items and the list's
numbering untouched. In a list of another kind a trigger still turns the whole list into its
kind, and in a paragraph it still makes a list. Mod+Shift+7, 8 and 9 still toggle. Both
engines behave the same.
