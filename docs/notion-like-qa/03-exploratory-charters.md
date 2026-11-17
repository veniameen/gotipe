# Notion-like Exploratory Charters

_Last updated: February 14, 2026_

## Charter 1: Slash in every block type

Mission:

- run the slash commands in `paragraph`, `heading`, `listItem`, `todoItem`, `blockquote`, `codeBlock`

Focus:

- does the line disappear
- is the `/query` trigger removed correctly
- where the caret ends up after the command runs

Artifacts:

- a short `pass/fail` log for each block type
- a screenshot for any visual bug

## Charter 2: List conversion torture

Mission:

- multi-step sequences:
  - `paragraph -> bullet -> todo -> ordered -> text`
  - `todo -> heading -> bullet -> text`

Focus:

- is the text of every line preserved
- does the parent list structure stay intact
- Undo/Redo correctness after the chain

## Charter 3: Enter/Backspace edge cases

Mission:

- check block start/end and empty blocks in list/todo

Focus:

- Enter in an empty item
- Backspace at the start of the second item
- merge/split without losing the caret

## Charter 4: Theme and visual parity

Mission:

- visually check light/dark on the slash menu and block toolbar

Focus:

- text contrast
- hover/selected states
- spacing and no overflow

## Charter 5: Accessibility sanity

Mission:

- a quick pass over ARIA and keyboard navigation of the slash menu

Focus:

- `ArrowUp/ArrowDown/Enter/Escape`
- focus is not lost to buttons outside the editor content
- no keyboard trap

## Charter 6: Native IME (RU/JP/KR) in headed mode

Mission:

- run real OS-level composition scenarios (not synthetic events) in the Notion-like editor.

Focus:

- composition-start/update/end on:
  - paragraph
  - listItem
  - todoItem
  - after a slash transform
- Enter/Backspace during and right after composition.
- Undo/Redo after composition.
- caret/selection stability (does not jump to the left edge, block context is not lost).

Scenarios:

- RU: Cyrillic + space + Enter in paragraph/todo.
- JP: hiragana -> kanji conversion -> Enter to confirm.
- KR: hangul syllable composition + fast Backspace.
- mixed: composition in a list item, then a slash transform into another block type.

Artifacts:

- a pass/fail table by language and context.
- a short video/gif for each caret/selection drift defect.
- a final summary of the parity gap relative to Notion.

## Charter 7: Headed Gutter Jitter (`+` / drag-handle)

Mission:

- check the interactivity of the left gutter under aggressive mouse trajectories in headed mode.

Focus:

- the toolbar stays attached to the current line (does not “fly away”).
- `+` is clickable right after jitter without losing the hover state.
- the drag handle reliably opens the context menu after jitter.

Scenarios:

- rapid row-to-row jitter (40 passes).
- jitter burst + immediate plus click (16 passes, with `undo` to normalize the document).
- jitter + drag-handle click + `Esc` close (18 passes).

Artifacts:

- screenshots: `output/playwright/notion-like-headed-gutter-jitter/`
- traces: `output/playwright/notion-like-headed-gutter-jitter-results/**/trace.zip`
- repeat traces: `output/playwright/notion-like-headed-gutter-jitter-results-repeat/**/trace.zip`
