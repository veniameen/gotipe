# Notion-like Step2 Parity Hardening Report

_Date: February 14, 2026_

## Scope

1. Harden hover-toolbar interaction (`+`, drag-handle) for fast/jagged pointer movement.
2. Harden slash-command caret fallback for empty `todoItem`.
3. Add targeted Playwright regressions for Step2 parity behavior.

## Code Changes

- `/Users/veniameen/Projects/gotipe/packages/block-editor/src/components/block-editor.tsx`
  - Added delayed-hide anti-flicker policy for toolbar visibility (`TOOLBAR_HIDE_DELAY_MS=140`).
  - Added hide timer lifecycle cleanup.
  - Kept toolbar visible while pointer is inside toolbar/menu wrapper.
  - Prevented transient hide during rapid move from content to gutter controls.

- `/Users/veniameen/Projects/gotipe/packages/block-editor/src/components/slash-menu.tsx`
  - In `setDomCaretInBlock(...)`, added explicit fallback for empty `todoItem`:
    - DOM caret now targets `[data-gotipe-todo-content]` instead of `<li>` root.

- `/Users/veniameen/Projects/gotipe/e2e/notion-like-step2-parity.spec.ts` (new)
  - `slash boundary behavior in bullet/todo rows matches Notion baseline`
  - `jagged fast-hover keeps + and drag handle clickable on list rows`

## Verification

### New Step2 parity suite

- `pnpm playwright test e2e/notion-like-step2-parity.spec.ts --project=chromium --workers=1`
  - `2/2` PASS
- `pnpm playwright test e2e/notion-like-step2-parity.spec.ts --project=firefox --workers=1`
  - `2/2` PASS
- `pnpm playwright test e2e/notion-like-step2-parity.spec.ts --project=webkit --workers=1`
  - `2/2` PASS

### Stress repeat for new suite

- `pnpm playwright test e2e/notion-like-step2-parity.spec.ts --project=chromium --workers=1 --repeat-each=5 --reporter=dot`
  - `10/10` PASS
- `pnpm playwright test e2e/notion-like-step2-parity.spec.ts --project=webkit --workers=1 --repeat-each=5 --reporter=dot`
  - `10/10` PASS

### Regression safety on affected areas

- `pnpm playwright test e2e/block-toolbar.spec.ts e2e/block-toolbar-fast-hover.spec.ts --project=chromium --workers=1`
  - `34/34` PASS
- `pnpm playwright test e2e/block-toolbar.spec.ts e2e/block-toolbar-fast-hover.spec.ts --project=webkit --workers=1`
  - `34/34` PASS
- `pnpm playwright test e2e/notion-like-matrix.spec.ts --project=chromium --workers=1 --grep "todo caret stays after checkbox in empty item|todo click in left zone normalizes caret after checkbox \(empty item\)|slash at line start preserves existing text|code block Enter inserts newline instead of duplicating block|block toolbar is anchored to content gutter"`
  - `5/5` PASS
- `pnpm playwright test e2e/notion-like-matrix.spec.ts --project=webkit --workers=1 --grep "todo caret stays after checkbox in empty item|todo click in left zone normalizes caret after checkbox \(empty item\)|code block Enter inserts newline instead of duplicating block|block toolbar is anchored to content gutter"`
  - `4/4` PASS

## Notes

- A candidate test for slash-menu click-path caret validation was excluded from this Step2 batch due unstable WebKit menu-open conditions in repeat mode.
- Existing matrix tests continue to cover todo-caret normalization and passed in Chromium/WebKit.
