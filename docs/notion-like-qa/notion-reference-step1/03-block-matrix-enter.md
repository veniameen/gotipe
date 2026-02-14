# Step 1C: Block Matrix (Slash + Enter)

## Matrix Scope

- Heading 2
- Heading 3
- Bullet list
- Numbered list
- To-do list
- Quote
- Code block

## Repro Pattern (Per Block)

1. Open new editable line.
1. Type slash command (e.g. `/heading 2`).
1. Press Enter to apply.
1. Type sample text.
1. Press Enter.
1. Capture active context and screenshot.

## Recorded Matrix

- Source JSON:
- `/Users/veniameen/Projects/gotipe/output/playwright/notion-step1/deep-audit-2026-02-13T22-57-32-311Z.json`
- Steps:
- `M-heading-2`
- `M-heading-3`
- `M-bullet-list`
- `M-numbered-list`
- `M-to-do-list`
- `M-quote`
- `M-code-block`

## Key Findings

- Heading 2 / Heading 3:
- slash transform applies correctly;
- Enter returns flow to regular text line.

- Bullet / Numbered / To-do:
- slash transform applies to list mode;
- Enter continues list flow first, then exits when list-ending rule is hit (captured behavior consistent with Notion list model).

- Quote:
- slash transform applies;
- Enter on filled quote line returns to normal text flow.

- Code block:
- Enter stays inside code block (new line inside code).
- This is a critical parity rule for our editor:
- single Enter in code should not jump out to paragraph.

## Screenshots

- Heading 2:
- `/Users/veniameen/Projects/gotipe/output/playwright/notion-step1/deep-2026-02-13T22-57-32-311Z/matrix-heading-2.png`
- Heading 3:
- `/Users/veniameen/Projects/gotipe/output/playwright/notion-step1/deep-2026-02-13T22-57-32-311Z/matrix-heading-3.png`
- Bullet:
- `/Users/veniameen/Projects/gotipe/output/playwright/notion-step1/deep-2026-02-13T22-57-32-311Z/matrix-bullet-list.png`
- Numbered:
- `/Users/veniameen/Projects/gotipe/output/playwright/notion-step1/deep-2026-02-13T22-57-32-311Z/matrix-numbered-list.png`
- To-do:
- `/Users/veniameen/Projects/gotipe/output/playwright/notion-step1/deep-2026-02-13T22-57-32-311Z/matrix-to-do-list.png`
- Quote:
- `/Users/veniameen/Projects/gotipe/output/playwright/notion-step1/deep-2026-02-13T22-57-32-311Z/matrix-quote.png`
- Code:
- `/Users/veniameen/Projects/gotipe/output/playwright/notion-step1/deep-2026-02-13T22-57-32-311Z/matrix-code-block.png`

## Parity Requirements for Our Editor

- Slash commands must deterministically apply requested block type on current row.
- Enter behavior must be block-type aware:
- headings/quote/text: create next normal line,
- list/todo: continue item / allow clean exit on empty item,
- code: stay in code on Enter.
- No cursor teleportation to unrelated previous rows.
