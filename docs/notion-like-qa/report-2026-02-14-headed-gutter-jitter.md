# Report: Headed Gutter Jitter Exploratory (February 14, 2026)

## Scope

- Headed exploratory pass for left gutter controls in Notion-like editor:
  - rapid row-to-row mouse jitter
  - immediate plus-click after jitter
  - drag-handle context-menu open/close under jitter
- Goal: verify practical clickability and toolbar anchoring under noisy pointer paths.

## New automation

- Added suite: `e2e/notion-like-gutter-jitter-headed.spec.ts`
- Coverage:
  - `HEAD-JITTER-001`: rapid jitter keeps toolbar attached to hovered block.
  - `HEAD-JITTER-002`: plus button remains clickable after jitter bursts.
  - `HEAD-JITTER-003`: drag-handle context menu remains stable under jitter.

## Test runs

1. Chromium headed:
   - `pnpm playwright test e2e/notion-like-gutter-jitter-headed.spec.ts --project=chromium --workers=1 --headed --trace on --output=output/playwright/notion-like-headed-gutter-jitter-results`
   - Result: `3/3` PASS
2. Firefox + WebKit headed:
   - `pnpm playwright test e2e/notion-like-gutter-jitter-headed.spec.ts --project=firefox --project=webkit --workers=1 --headed --trace on --output=output/playwright/notion-like-headed-gutter-jitter-results`
   - Result: `6/6` PASS
3. Chromium headed repeat:
   - `pnpm playwright test e2e/notion-like-gutter-jitter-headed.spec.ts --project=chromium --workers=1 --headed --trace on --repeat-each=2 --output=output/playwright/notion-like-headed-gutter-jitter-results-repeat`
   - Result: `6/6` PASS
4. Headed combined sanity:
   - `pnpm playwright test e2e/notion-like-gutter-jitter-headed.spec.ts e2e/notion-like-integrated-chaos.spec.ts e2e/notion-like-crossblock-nested-chains.spec.ts --project=chromium --workers=1 --headed --trace on --output=output/playwright/notion-like-headed-gutter-jitter-combined`
   - Result: `9/9` PASS

## Artifacts

- Screenshots directory:
  - `output/playwright/notion-like-headed-gutter-jitter/`
- Trace artifacts:
  - `output/playwright/notion-like-headed-gutter-jitter-results/**/trace.zip`
  - `output/playwright/notion-like-headed-gutter-jitter-results-repeat/**/trace.zip`
  - `output/playwright/notion-like-headed-gutter-jitter-combined/**/trace.zip`
  - `output/playwright/notion-like-headed-gutter-jitter-smoke/**/trace.zip`
- Snapshot totals from this pass:
  - PNG screenshots: `71`
  - `trace.zip` files: `24`

Note:

- Playwright CLI in this environment does not accept `--video` option (`unknown option '--video'`).
- For this pass, artifacts are screenshots + trace zips.

## Outcome

- Headed exploratory jitter pass is green across Chromium/Firefox/WebKit.
- No regressions found in gutter clickability (`+`/drag) under aggressive pointer movement.
- Additionally strengthened the retry in the hover-activation helper (`e2e/helpers/notion-chaos.ts`) and in the headed jitter suite, to remove transient drag-handle misses in long combined runs.
