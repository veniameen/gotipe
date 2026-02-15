# Notion-like QA Report — Critical Cross-Browser Pack

_Date: February 14, 2026_

## Scope

- Close remaining reliability matrix entries:
  - `REL-004` (Firefox critical run)
  - `REL-005` (WebKit critical run)
- Validate all critical suites together in Firefox/WebKit.

## Flake Hardening Performed

- `e2e/notion-like-matrix.spec.ts`:
  - `placeCaretInTopLevelListItem(...)` switched to editor-API selection with deterministic poll.
  - `placeCaretAtStartOfBlockByMarker(...)` switched to editor-API selection with deterministic poll.
- `e2e/slash-menu.spec.ts`:
  - caret/menu proximity threshold relaxed for WebKit line-box rounding (`<128` instead of `<100`).

## Critical Pack Command

`pnpm playwright test e2e/notion-like-matrix.spec.ts e2e/slash-menu.spec.ts e2e/block-toolbar-fast-hover.spec.ts e2e/notion-like-matrix-planned-core.spec.ts e2e/notion-like-matrix-planned-ui.spec.ts e2e/notion-like-matrix-planned-selection.spec.ts e2e/notion-like-matrix-planned-reliability.spec.ts --project=firefox --project=webkit`

## Result

- Firefox + WebKit: `134/134 PASS`.
- Matrix status after run:
  - `REL-004`: `Automated`
  - `REL-005`: `Automated`
  - remaining `Planned`: `0`
