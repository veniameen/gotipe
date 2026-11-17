# Notion-like Case Matrix

_Last updated: February 14, 2026_

## Legend

- `Automated`: covered by e2e
- `Planned`: case is in the roadmap, test not written yet
- `Manual`: manual check only for now
- `Fixme`: case is automated/described but temporarily quarantined because of known flakiness

## Slash & Block Transform

| ID | Scenario | Expected | Status |
|---|---|---|---|
| SLASH-001 | paragraph -> bullet | a listItem is created, the line does not disappear | Automated |
| SLASH-002 | paragraph -> ordered | an ordered list item is created | Automated |
| SLASH-003 | paragraph -> todo | a todoItem is created | Automated |
| SLASH-004 | todo -> bullet | the text of the current line is preserved | Automated |
| SLASH-005 | todo -> ordered | the text of the current line is preserved | Automated |
| SLASH-006 | bullet -> todo | the text of the current line is preserved | Automated |
| SLASH-007 | ordered -> bullet | the text of the current line is preserved | Automated |
| SLASH-008 | bullet -> text | the list item is correctly lifted into a paragraph | Automated |
| SLASH-009 | todo -> heading 1 | the item is lifted into h1 without losing text | Automated |
| SLASH-010 | slash at the start of a non-empty line | existing text is not deleted | Automated |
| SLASH-011 | slash + Enter in an empty paragraph | the target block is created, the caret stays in it | Automated |
| SLASH-012 | slash menu Esc | the menu closes, the editor stays usable | Automated |
| SLASH-013 | slash menu click outside | the menu closes | Automated |
| SLASH-014 | slash query with no matches | an empty state is visible | Automated |
| SLASH-015 | slash in a list item with marks | marks are not broken | Automated |
| SLASH-016 | slash with a range selection | predictable behavior, no crash | Automated |
| SLASH-017 | slash in heading -> paragraph | the type changes correctly | Automated |
| SLASH-018 | slash in a nested list | nesting is not lost | Automated |
| SLASH-019 | slash near viewport bottom | the menu flips upward | Automated |
| SLASH-020 | slash near right edge | no horizontal overflow | Automated |
| SLASH-021 | immediate typing after clicking a slash item | the first character is not lost | Automated |
| SLASH-022 | data-driven source->target matrix (72 transitions) | text is preserved, the target type is correct | Automated |
| SLASH-023 | slash keyboard nav (`↑`, `↓`, `Enter`) | the selected command is applied without mouse interaction | Automated |

## Enter / Backspace / Caret

| ID | Scenario | Expected | Status |
|---|---|---|---|
| ENTER-001 | Enter in a paragraph | split into a new paragraph | Automated |
| ENTER-002 | Enter in an empty paragraph | the new line is immediately visible | Automated |
| ENTER-003 | Shift+Enter | soft break in the same block | Automated |
| ENTER-004 | Enter in a non-empty todo | a new todoItem is created | Automated |
| ENTER-005 | Enter in an empty todo | exits to a paragraph | Automated |
| ENTER-006 | Enter in a bullet item | a new listItem | Automated |
| ENTER-007 | Enter in an ordered item | a new listItem | Automated |
| ENTER-008 | Backspace at the start of a block | merge with the previous block | Automated |
| ENTER-009 | Backspace at the start of the second list item | correct list behavior | Automated |
| ENTER-010 | Undo/Redo after a slash transform | the document tree is restored correctly | Automated |
| ENTER-011 | Caret in an empty todo right after slash | the caret is after the checkbox in the text host, not at the left edge of the list | Automated |
| ENTER-012 | Enter in a code block | `\\n` is inserted in the same block, the code block is not duplicated | Automated |
| ENTER-013 | Escape in a code block | a paragraph is created after the block and the caret moves into it | Automated |

## Selection / Formatting

| ID | Scenario | Expected | Status |
|---|---|---|---|
| SEL-001 | bubble menu bold/italic | the selection is not visually lost | Automated |
| SEL-002 | toolbar bold/italic (simple/agent) | the selection stays active | Automated |
| SEL-003 | headless bold | focus returns to the editor | Automated |
| SEL-004 | slash transform after a selection | selection/caret are not broken | Automated |
| SEL-005 | mark toggle on a list item | marks are applied without artifacts | Automated |

## UI / Layout / Theme

| ID | Scenario | Expected | Status |
|---|---|---|---|
| UI-001 | slash menu width/height | compact size within limits | Automated |
| UI-002 | slash menu does not jump to the top-left corner | the menu is at the caret | Automated |
| UI-003 | slash menu no horizontal overflow | content does not overflow | Automated |
| UI-004 | light theme slash menu | the light theme is correct | Automated |
| UI-005 | dark theme slash menu | the dark theme is correct | Automated |
| UI-006 | block toolbar gutter anchor | `+` and drag are next to the block | Automated |
| UI-007 | mobile width behavior | the menu does not break the layout on a narrow screen | Automated |
| UI-008 | long command titles | ellipsis without breaking the layout | Automated |
| UI-009 | todo checkbox/text alignment | the checkbox and text are vertically aligned, with a stable gap | Automated |

## Reliability and stress

| ID | Scenario | Expected | Status |
|---|---|---|---|
| REL-001 | 50 consecutive slash transforms | no crash or DOM/state desync | Automated |
| REL-002 | paste + slash + undo chain | stable state | Automated |
| REL-003 | fast typing + Enter mash | no lost blocks | Automated |
| REL-004 | Firefox run | critical cases are stable | Automated |
| REL-005 | WebKit run | critical cases are stable | Automated |
| REL-006 | mixed stress create/change/delete (18 iterations) | no crash, markers are not lost in any iteration | Automated |
| REL-007 | transform-matrix repeat runs | no flakes with `repeat-each=2` | Automated |
