# Notion-like QA Report — Planned Selection Batch

_Date: February 14, 2026_

## Scope

- Closed matrix case:
  - `SEL-005` (mark toggle on a list item without artifacts)

## Implementation

- Added targeted e2e suite:
  - `e2e/notion-like-matrix-planned-selection.spec.ts`
- Coverage in this suite:
  - `bulletList -> listItem`
  - `orderedList -> listItem`
  - `todoList -> todoItem`
  - toggle `bold` and `italic` on/off with bubble menu
  - assertions: the structure (`parentType/itemType`) and text stay intact, mark spans toggle on/off correctly

## Test Runs

1. Chromium:
   - `pnpm playwright test e2e/notion-like-matrix-planned-selection.spec.ts --project=chromium`
   - Result: `1/1 PASS`
2. Firefox + WebKit:
   - `pnpm playwright test e2e/notion-like-matrix-planned-selection.spec.ts --project=firefox --project=webkit`
   - Result: `2/2 PASS`
3. Combined regression (Chromium):
   - `pnpm playwright test e2e/slash-menu.spec.ts e2e/block-toolbar-fast-hover.spec.ts e2e/notion-like-matrix-planned-core.spec.ts e2e/notion-like-matrix-planned-ui.spec.ts e2e/notion-like-matrix-planned-selection.spec.ts --project=chromium`
   - Result: `32/32 PASS`

## Matrix Status Update

- `SEL-005`: `Planned -> Automated`
