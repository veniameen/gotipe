# Notion-like Planned Core Batch Report

_Date: February 14, 2026_

## Scope

- Close remaining planned matrix cases:
  - `SLASH-011`
  - `SLASH-015`
  - `SLASH-016`
  - `ENTER-010`
- Also close aligned selection case:
  - `SEL-004`

## Added Coverage

- New suite:
  - `/Users/veniameen/Projects/gotipe/e2e/notion-like-matrix-planned-core.spec.ts`
- Implemented checks:
  1. `SLASH-011`: `/h1` + `Enter` in empty paragraph creates heading and keeps caret in transformed block.
  2. `SLASH-015`: slash transform from marked list item keeps inline marks (`bold`) intact.
  3. `SLASH-016`: slash command while range selected is stable and applies block transform (no crash path).
  4. `ENTER-010`: undo/redo after slash transform restores document tree correctly.

## Stability Hardening Applied

- WebKit slash-open flake fixed inside test flow by:
  - explicit editor API caret placement (`setSelection`) before slash typing
  - fallback slash-menu open path (`"/"` then query in search input)

## Commands & Results

1. `pnpm playwright test e2e/notion-like-matrix-planned-core.spec.ts --project=chromium --workers=1`
   - Result: `4/4` PASS
2. `pnpm playwright test e2e/notion-like-matrix-planned-core.spec.ts --project=firefox --project=webkit --workers=1`
   - Result: `8/8` PASS
3. Regression check:
   - `pnpm playwright test e2e/notion-like-matrix-planned-core.spec.ts e2e/notion-like-step1-enter-shift-parity.spec.ts e2e/notion-like-step1-split-backspace-parity.spec.ts --project=chromium --workers=1`
   - Result: `19/19` PASS

## Status Update

- `SLASH-011`: `Automated`
- `SLASH-015`: `Automated`
- `SLASH-016`: `Automated`
- `ENTER-010`: `Automated`
- `SEL-004`: `Automated`
