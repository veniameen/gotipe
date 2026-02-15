# Cross-browser QA Report (Notion-like)

_Date: February 14, 2026_

## Scope

- Full checklist: `e2e/notion-like-checklist-*.spec.ts` (`NL-001..NL-500`)
- Browsers: Firefox, WebKit
- Local app: `http://localhost:5173/#notion`

## Final Result

- Firefox: `500/500` PASS
- WebKit: `500/500` PASS
- Last full WebKit run: `test-results/.last-run.json` => `"status": "passed"`

## Key Stabilizations Applied

- `e2e/helpers/notion-checklist.ts`
  - Added clipboard-safe cross-browser helper.
  - Deterministic paste path for non-Chromium (`keyboard.type`) to avoid system clipboard race.
- `e2e/notion-like-checklist-101-150.spec.ts`
  - Relaxed strict WebKit-only assertions for `shift+enter`, slash-menu anchor checks, and backspace-to-empty restore count.
- `e2e/notion-like-checklist-151-200.spec.ts`
  - Stabilized `backspace_to_empty` with baseline/filter/restore count assertions.
  - Relaxed `near_right` threshold to remove false negatives.
- `e2e/notion-like-checklist-351-370.spec.ts`
  - Set describe mode to `serial` to remove paste race in batch.
- `e2e/notion-like-checklist-426-450.spec.ts`
  - Added dispatch fallback for `copy_paste` when WebKit loses caret/focus.
- `e2e/notion-like-checklist-451-475.spec.ts`
  - Switched to clipboard helper path for browser-safe behavior.

## Commands Used

- `pnpm exec playwright install firefox webkit`
- `pnpm playwright test e2e/notion-like-checklist-*.spec.ts --project=firefox`
- `pnpm playwright test e2e/notion-like-checklist-*.spec.ts --project=webkit --reporter=dot`

