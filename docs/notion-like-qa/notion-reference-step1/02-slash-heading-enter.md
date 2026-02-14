# Step 1B: Slash Menu, Heading Placeholder, Enter

## Scenario

- Trigger slash menu from editable content.
- Check where menu is rendered (not top-left fallback).
- Convert line to `Heading 1` via slash.
- Observe empty heading state and behavior after first Enter.

## Repro Sequence

1. Create paragraph context (`/text` -> Enter).
1. Type marker line and open a new empty row.
1. Type `/` to open command menu.
1. Capture menu DOM geometry and screenshot.
1. Close menu, run `/heading 1` + Enter.
1. Capture empty heading state before typing.
1. Type heading text, press Enter, capture next active line state.

## Observations

- Slash menu is rendered as dialog/listbox container inside content layer, not in viewport top-left.
- DOM evidence (menu probe):
- `role="dialog"`
- menu geometry captured:
- `x=508, y=476, w=324, h=384`
- options include:
- `Text`
- `Heading 1`
- `Heading 2`
- `Heading 3`
- `Bulleted list`
- `Numbered list`
- `To-do list`

- Heading transform (`/heading 1`) behavior:
- Active editable becomes empty heading block (text length 0) before user types.
- Then typing text fills heading.
- Enter after heading returns editing flow to a normal text block line.

## Artifacts

- Slash menu screenshot:
- `/Users/veniameen/Projects/gotipe/output/playwright/notion-step1/deep-2026-02-13T22-57-32-311Z/03-slash-menu.png`
- Heading placeholder screenshot:
- `/Users/veniameen/Projects/gotipe/output/playwright/notion-step1/deep-2026-02-13T22-57-32-311Z/04-heading-placeholder.png`
- Enter after heading screenshot:
- `/Users/veniameen/Projects/gotipe/output/playwright/notion-step1/deep-2026-02-13T22-57-32-311Z/05-heading-enter.png`

- Slash geometry JSON:
- `/Users/veniameen/Projects/gotipe/output/playwright/notion-step1/slash-anchor-2026-02-13T23-04-30-175Z.json`
- Slash menu DOM probe JSON:
- `/Users/veniameen/Projects/gotipe/output/playwright/notion-step1/menu-dom-inspect-2026-02-13T23-01-54-665Z.json`

## Notes on Caret Geometry

- In some runs, caret bbox reported as zero/unstable because focus moves into slash menu quickly.
- For parity this does not block implementation:
- menu container is confirmed in editor-content zone (`x~508`) and not at `(0,0)`.
- placement behavior (above vs below) should be implemented using available-space logic around caret line.

## Parity Requirements for Our Editor

- Slash menu must open near caret line in content lane.
- If there is not enough space below, menu should open above.
- `Heading 1` slash action should produce empty heading state without cursor jump to unrelated rows.
- Enter after heading must continue editing on a new normal line.
