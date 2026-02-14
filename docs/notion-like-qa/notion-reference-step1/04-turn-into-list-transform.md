# Step 1D: Turn Into + List Transform Scenarios

## Scope

- Open row handle menu (6 dots).
- Use `Turn into` to convert block type.
- Validate to-do scenario with slash transform in later row.

## Turn Into Probe

- Probe JSON:
- `/Users/veniameen/Projects/gotipe/output/playwright/notion-step1/turn-into-2026-02-13T22-58-28-909Z.json`

- Captured menu entries include:
- `Turn into`
- `Color`
- `Copy link to block`
- `Duplicate`
- `Move to`
- `Delete`
- `Comment`
- `Suggest edits`
- `Ask AI`

- Click geometry captured for stable automation:
- source row bbox around `x=484, y=856.97, w=710, h=30`
- handle click point around `x=464, y=871.97`

## Turn Into Visual Evidence

- Hover + handle reveal:
- `/Users/veniameen/Projects/gotipe/output/playwright/notion-step1/turn-into-2026-02-13T22-58-28-909Z/01-hover.png`
- Menu open:
- `/Users/veniameen/Projects/gotipe/output/playwright/notion-step1/turn-into-2026-02-13T22-58-28-909Z/02-menu-open.png`
- After `Turn into -> Heading 2`:
- `/Users/veniameen/Projects/gotipe/output/playwright/notion-step1/turn-into-2026-02-13T22-58-28-909Z/03-turned-heading2.png`
- After `Turn into -> To-do list`:
- `/Users/veniameen/Projects/gotipe/output/playwright/notion-step1/turn-into-2026-02-13T22-58-28-909Z/04-turned-todo.png`

## To-do Slash Transform Scenario

- Source step:
- `S08` in `/Users/veniameen/Projects/gotipe/output/playwright/notion-step1/deep-audit-2026-02-13T22-57-32-311Z.json`

- Scenario:
1. Create to-do flow with multiple rows.
1. On next row run slash transform `/heading 1` and apply Enter.

- Evidence screenshot:
- `/Users/veniameen/Projects/gotipe/output/playwright/notion-step1/deep-2026-02-13T22-57-32-311Z/08-todo-third-transform.png`

## Behavior Notes

- Row handle menu is contextual and attached to hovered row, not global.
- `Turn into` is reachable directly from row menu and supports type conversion chain.
- To-do + slash transform keeps operation in local editing context (no global jump in Notion baseline capture).

## Parity Requirements for Our Editor

- 6-dot menu must open for hovered row only.
- `Turn into` must convert current row in place and preserve text when applicable.
- Slash transform inside list/todo rows must not:
- clear wrong row,
- move cursor to first item unexpectedly,
- break surrounding list order.
