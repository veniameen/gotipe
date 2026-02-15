# Notion-like Transform Matrix Unquarantine Report

_Date: February 14, 2026_

## Scope

- Remove quarantine for:
  - `SLASH-022` (source->target transform matrix)
  - `REL-007` (repeat-run stability for transform matrix)
- Stabilize WebKit flake path in transform matrix runs.

## Changes Applied

1. Enabled matrix suite from `fixme` to active run:
   - `e2e/notion-like-transform-matrix.spec.ts`
   - `test.describe.fixme(...)` -> `test.describe(...)`
2. Hardened caret placement before slash transform:
   - `e2e/notion-like-transform-matrix.spec.ts`
   - `placeCaretAtStartOfBlockByMarker` now prefers editor API `setSelection(...)` to avoid DOM-only caret drift in WebKit.
   - DOM-range fallback kept as backup when API is unavailable.

## Validation Runs

1. Chromium full matrix:
   - `pnpm playwright test e2e/notion-like-transform-matrix.spec.ts --project=chromium --workers=1`
   - Result: `72/72` PASS
2. Chromium repeat stability:
   - `pnpm playwright test e2e/notion-like-transform-matrix.spec.ts --project=chromium --workers=1 --repeat-each=2`
   - Result: `144/144` PASS
3. WebKit full matrix (after caret hardening):
   - `pnpm playwright test e2e/notion-like-transform-matrix.spec.ts --project=webkit --workers=1`
   - Result: `72/72` PASS
4. Chromium + Firefox cross-check (after caret hardening):
   - `pnpm playwright test e2e/notion-like-transform-matrix.spec.ts --project=chromium --project=firefox --workers=1`
   - Result: `144/144` PASS

## Observed Root Cause (WebKit)

- Before hardening, intermittent failures were concentrated around:
  - slash menu not opening in some transitions
  - caret-start precondition occasionally not being satisfied before typing `/...`
- The failure was caused by unstable DOM-only caret restoration in some WebKit transitions.
- For matrix tests, editor API selection placement (`setSelection`) removed this nondeterminism.

## Final Status

- `SLASH-022`: CLOSED, `Automated`
- `REL-007`: CLOSED, `Automated`
- `e2e/notion-like-transform-matrix.spec.ts`: active in regression runs (no quarantine)
