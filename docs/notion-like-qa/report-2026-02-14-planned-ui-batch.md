# Notion-like QA Report — Planned UI Batch

_Date: February 14, 2026_

## Scope

- Closed matrix cases:
  - `SLASH-019` (slash near viewport bottom should flip up)
  - `UI-007` (mobile width behavior)
  - `UI-008` (long command title ellipsis)

## Implementation Changes

- Added new e2e suite:
  - `e2e/notion-like-matrix-planned-ui.spec.ts`
- Fixed mobile slash-menu width regression:
  - `packages/theme/src/theme.css`
  - mobile rule changed to `width: min(300px, 90vw); max-width: 90vw;`

## Findings During Run

- Initial automation run found two concrete issues:
  - `UI-007` failed on narrow viewport because mobile override rendered menu wider than target (`>300px`).
  - `SLASH-019` needed stable flip assertion tied to viewport-bottom scenario and post-animation geometry.
- After CSS fix and assertion hardening, all targeted runs passed.

## Test Runs

1. Targeted suite (Chromium):
   - `pnpm playwright test e2e/notion-like-matrix-planned-ui.spec.ts --project=chromium`
   - Result: `3/3 PASS`
2. Targeted suite (Firefox + WebKit):
   - `pnpm playwright test e2e/notion-like-matrix-planned-ui.spec.ts --project=firefox --project=webkit`
   - Result: `6/6 PASS`
3. Regression pack (Chromium):
   - `pnpm playwright test e2e/slash-menu.spec.ts e2e/block-toolbar-fast-hover.spec.ts e2e/notion-like-matrix-planned-core.spec.ts e2e/notion-like-matrix-planned-ui.spec.ts --project=chromium`
   - Result: `31/31 PASS`
4. Stability repeat (Chromium):
   - `pnpm playwright test e2e/notion-like-matrix-planned-ui.spec.ts --project=chromium --repeat-each=3`
   - Result: `9/9 PASS`

## Matrix Status Update

- `SLASH-019`: `Planned -> Automated`
- `UI-007`: `Planned -> Automated`
- `UI-008`: `Planned -> Automated`
