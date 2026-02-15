# Notion-like QA Report — Row Hover Animation Parity

_Date: February 14, 2026_

## Goal

Re-capture Notion row-hover behavior on:

- `https://www.notion.so/heading-1-3065ab020ff680b7b379c78bb0e7504d`

and align Notion-like left row controls animation (`+` and drag-handle) with observed behavior.

## Notion Re-Capture (new pass)

### Commands run

1. `NOTION_PAGE_URL='https://www.notion.so/heading-1-3065ab020ff680b7b379c78bb0e7504d' node e2e/notion-step1-deep-audit.mjs`
2. `NOTION_PAGE_URL='https://www.notion.so/heading-1-3065ab020ff680b7b379c78bb0e7504d' node e2e/notion-step2-list-row-audit.mjs`
3. `NOTION_PAGE_URL='https://www.notion.so/heading-1-3065ab020ff680b7b379c78bb0e7504d' node e2e/notion-step2-row-transition-audit.mjs`

### Artifacts

- Step1 deep audit JSON:
  - `/Users/veniameen/Projects/gotipe/output/playwright/notion-step1/deep-audit-2026-02-14T23-15-23-420Z.json`
- Step1 screenshots:
  - `/Users/veniameen/Projects/gotipe/output/playwright/notion-step1/deep-2026-02-14T23-15-23-420Z/`
- Step2 list-row audit JSON:
  - `/Users/veniameen/Projects/gotipe/output/playwright/notion-step2/list-row-audit-2026-02-14T23-15-23-420Z.json`
- Step2 list-row screenshots:
  - `/Users/veniameen/Projects/gotipe/output/playwright/notion-step2/list-row-2026-02-14T23-15-23-420Z/`
- Step2 row-transition audit JSON:
  - `/Users/veniameen/Projects/gotipe/output/playwright/notion-step2/row-transition-audit-2026-02-14T23-15-23-420Z.json`
- Step2 row-transition screenshots:
  - `/Users/veniameen/Projects/gotipe/output/playwright/notion-step2/row-transition-2026-02-14T23-15-23-420Z/`

## Observed Notion behavior (row-to-row hover)

From `row-transition-audit-2026-02-14T23-15-23-420Z.json`:

- `A-before-hover`: controls count `0`
- `A-hover-10ms`: controls count `2`
- `A-hover-40ms`: controls count `2`
- `A-leave-neutral-20ms`: controls count `0`
- `B-hover-10ms`: controls count `2`
- `C-hover-10ms`: controls count `2`

Geometry is stable across rows in this viewport:

- `+` control around `x=432`
- drag-handle around `x=456`
- only `y` changes per hovered row

Animation style on controls (from deep/list audits):

- `transitionDuration: 0.02s`
- `transitionProperty: background`
- no opacity transition detected on control buttons

## Parity changes applied in our editor

### Runtime behavior

- File: `packages/block-editor/src/components/block-editor.tsx`
- Reduced toolbar hide delay:
  - `TOOLBAR_HIDE_DELAY_MS: 140 -> 20`
- Added Notion-like hover envelope (X-gating around row text):
  - show controls only inside local gutter band (`textLeft - 120 ... textLeft + 20`)
  - hide controls quickly when pointer moves to neutral right-side area

### Visual micro-motion

- File: `packages/theme/src/theme.css`
- Aligned block-toolbar button transition to Notion-like short background transition:
  - `transition: background 20ms linear`

### Local parity probe (our editor, after changes)

- `hover-10ms`: controls count `2`
- `leave-neutral-20ms`: controls count `0`
- `next-row-hover-10ms`: controls count `2`

Probe screenshots:

- `/Users/veniameen/Projects/gotipe/output/playwright/notion-like-row-transition-parity/01-before-hover.png`
- `/Users/veniameen/Projects/gotipe/output/playwright/notion-like-row-transition-parity/02-a-hover-10ms.png`
- `/Users/veniameen/Projects/gotipe/output/playwright/notion-like-row-transition-parity/03-a-leave-20ms.png`
- `/Users/veniameen/Projects/gotipe/output/playwright/notion-like-row-transition-parity/04-b-hover-10ms.png`
- `/Users/veniameen/Projects/gotipe/output/playwright/notion-like-row-transition-parity/05-final-hover-todo-row.png`

## Safety checks

1. `pnpm --filter @gotipe/block-editor build`
2. `pnpm playwright test e2e/notion-like-step2-parity.spec.ts --project=chromium --workers=1`
   - Result: `4/4 PASS`
3. `pnpm playwright test e2e/block-toolbar-fast-hover.spec.ts --project=chromium --workers=1`
   - Result: `18/18 PASS`

## Notes

- List typography/indent tuning that shifted text column was rolled back.
- Current scope kept to row-hover animation parity only.
