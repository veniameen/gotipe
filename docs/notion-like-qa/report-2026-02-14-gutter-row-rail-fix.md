# Notion-like QA Report — Gutter Row Rail Fix

_Date: February 14, 2026_

## Scope

Fixed two user-reported defects in Notion-like left row controls (`+` and drag-handle):

1. X-position jitter: controls must stay on one fixed rail.
2. List behavior: controls must attach to each list row (`listItem`/`todoItem`), not only to the list container top.

## Root cause

- Hover hit-test logic was top-level-block oriented.
- In left gutter paths (`mouseX` left of content text), `elementsFromPoint` often missed nested list rows and fell back to list container.
- Previous X expectation in one stress spec was text-relative (variable by block type), conflicting with fixed-rail product requirement.
- Playground consumes `@gotipe/block-editor` from `dist`; source-only edits were not active until package rebuild.

## Changes

### Runtime fix

- File: `packages/block-editor/src/components/block-editor.tsx`
- Added row-aware hover resolution for list containers:
  - `getRowAnchorBlockIdAtPoint(...)`
  - `findNearestRowInList(...)`
  - fallback remap: top-level list container -> nearest list row by `Y`.
- Added separate toolbar targets:
  - `anchorBlockId` for visual placement (row-level Y).
  - `actionBlockId` for toolbar actions (top-level compatibility).
- Unified fixed X rail:
  - `getToolbarRailLeft(...)` from `data-gotipe-content` left edge.
- Kept anti-flicker hide-delay behavior (`TOOLBAR_HIDE_DELAY_MS=140`) and wrapper hover guards.

### Test alignment

- File: `e2e/block-toolbar-fast-hover.spec.ts`
- Updated left-position assertion to fixed-rail geometry:
  - old: text-relative range per block
  - new: `wrapper.left ~= content.left - 36 - 8` (tolerance 2px)

## Build step required

Because playground imports workspace package through `dist` export:

- `pnpm --filter @gotipe/block-editor build`

## E2E runs (pass/fail)

1. `pnpm playwright test e2e/notion-like-step2-parity.spec.ts --project=chromium --workers=1`
- Result: `4/4 PASS`

2. `pnpm playwright test e2e/notion-like-step2-parity.spec.ts --project=firefox --project=webkit --workers=1`
- Result: `8/8 PASS`

3. `pnpm playwright test e2e/block-toolbar-fast-hover.spec.ts --project=chromium --workers=1`
- Result: `18/18 PASS`

## Visual artifacts

- `output/playwright/notion-like-left-rail-fix/01-heading-hover.png`
- `output/playwright/notion-like-left-rail-fix/02-bullet-item-2-hover.png`
- `output/playwright/notion-like-left-rail-fix/03-bullet-item-3-hover.png`
- `output/playwright/notion-like-left-rail-fix/04-todo-item-2-hover.png`

## Acceptance check

- Fixed X rail: PASS
- Row-level list hover: PASS
- No top-left jump: PASS
- `+` and drag-handle clickable after fast hover: PASS
