# Chromium Regression Report — 2026-02-14

## Scope

- parity-followup after Notion reference step 1
- `SLASH-010` unquarantine
- drag-handle `Turn into` implementation
- heading placeholder parity
- todo checkbox immediate-after-slash regression
- step 2 parity followup: list-row micro behavior + checklist batch `NL-101..NL-150`

## Commands & Results

1. `pnpm playwright test e2e/notion-like-matrix.spec.ts --project=chromium --workers=1`
- Result: `32 passed`

2. `pnpm playwright test e2e/block-toolbar.spec.ts --project=chromium --workers=1`
- Result: `16 passed`

3. `pnpm playwright test e2e/notion-like-matrix.spec.ts e2e/block-toolbar-fast-hover.spec.ts e2e/block-toolbar.spec.ts e2e/editor-production-ux.spec.ts --project=chromium --workers=1`
- Result: `79 passed`

4. `pnpm playwright test e2e/notion-like-checklist-101-150.spec.ts --project=chromium --workers=1`
- Result: `50 passed`

5. `pnpm playwright test e2e/notion-like-matrix.spec.ts e2e/block-toolbar-fast-hover.spec.ts e2e/block-toolbar.spec.ts e2e/notion-like-checklist-101-150.spec.ts --project=chromium --workers=1`
- Result: `116 passed`

## Newly covered / changed checks

- `slash at line start preserves existing text` moved from `fixme` to active pass.
- `Turn into converts paragraph to heading 2 and preserves text`.
- `Turn into converts paragraph to to-do list item and preserves text`.
- `slash: heading shows placeholder before typing and clears after input`.
- `todo checkbox toggle right after slash transform keeps text in place`.
- Full checklist batch `NL-101..NL-150` covered and green.
- Additional hardening in UI:
  - hover toolbar stays stable while pointer is on toolbar wrapper
  - todo left-zone click forces caret into todo text host

## Notes

- No failing tests in the target Chromium suites above.
- Transform-matrix quarantine (`SLASH-022` / `REL-007`) closed by a separate follow-up run (`docs/notion-like-qa/report-2026-02-14-transform-matrix-unquarantine.md`).
- Notion step 2 reference artifacts:
  - `output/playwright/notion-step2/list-row-audit-2026-02-14T00-01-03-991Z.json`
  - `docs/notion-like-qa/notion-reference-step2/00-index.md`
