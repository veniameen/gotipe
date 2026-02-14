# Step 2B: Parity Actions (Applied)

_Updated: February 14, 2026_

## Actions implemented in this iteration

1. Hover toolbar hardening:

- File: `/Users/veniameen/Projects/gotipe/packages/block-editor/src/components/block-editor.tsx`
- Change: prevent hover reset while cursor is over `.gotipe-block-toolbar` / `.gotipe-block-toolbar-wrapper`.
- Goal: avoid losing `+` and drag-handle interactivity during quick pointer movement.

2. Todo left-zone caret hardening:

- File: `/Users/veniameen/Projects/gotipe/packages/react/src/editor-content.tsx`
- Change: on `todoItem` mouse-down in left zone, force caret to `[data-gotipe-todo-content]` start.
- Goal: remove transient caret at left edge before checkbox.

3. Slash-menu outside click focus guard:

- File: `/Users/veniameen/Projects/gotipe/packages/block-editor/src/components/slash-menu.tsx`
- Change: outside `mousedown` closes menu and re-focuses editor in capture phase.
- Goal: consistent close behavior without focus drift side-effects.

## Batch automation added (NL-101..NL-150)

- New file: `/Users/veniameen/Projects/gotipe/e2e/notion-like-checklist-101-150.spec.ts`
- Coverage:
  - `NL-101..NL-120`: typing/Enter/Shift+Enter/Backspace/Delete for todo/blockquote/code/callout.
  - `NL-121..NL-150`: slash-menu open/filter/nav/escape/outside/no-results/backspace reset across contexts.

## Verification

- `pnpm playwright test e2e/notion-like-checklist-101-150.spec.ts --project=chromium --workers=1`
  - Result: `50 passed`
- Combined regression:
  - `pnpm playwright test e2e/notion-like-matrix.spec.ts e2e/block-toolbar-fast-hover.spec.ts e2e/block-toolbar.spec.ts e2e/notion-like-checklist-101-150.spec.ts --project=chromium --workers=1`
  - Result: `116 passed`
