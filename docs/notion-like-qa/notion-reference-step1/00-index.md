# Notion Reference Step 1 (Deep Audit Index)

- Date: 2026-02-14
- Workspace page: `https://www.notion.so/3065ab020ff680b7b379c78bb0e7504d?source=copy_link`
- Runtime page during runs: `https://www.notion.so/heading-1-3065ab020ff680b7b379c78bb0e7504d`

## Goal

- Capture production behavior of Notion with high detail for parity implementation in our `Notion-like` editor.
- Focus of this batch:
- hover-revealed row controls (`+` and drag handle),
- slash menu position/shape/behavior,
- heading placeholder + Enter behavior,
- block creation matrix via slash commands,
- transform via handle menu (`Turn into`),
- list scenario with slash transform inside to-do flow.

## Raw Artifacts

- Deep JSON report: `/Users/veniameen/Projects/gotipe/output/playwright/notion-step1/deep-audit-2026-02-13T22-57-32-311Z.json`
- Deep screenshots dir: `/Users/veniameen/Projects/gotipe/output/playwright/notion-step1/deep-2026-02-13T22-57-32-311Z`
- Turn-into probe JSON: `/Users/veniameen/Projects/gotipe/output/playwright/notion-step1/turn-into-2026-02-13T22-58-28-909Z.json`
- Turn-into screenshots dir: `/Users/veniameen/Projects/gotipe/output/playwright/notion-step1/turn-into-2026-02-13T22-58-28-909Z`
- Slash anchor probe JSON (menu geometry): `/Users/veniameen/Projects/gotipe/output/playwright/notion-step1/slash-anchor-2026-02-13T23-04-30-175Z.json`
- Slash menu DOM probe JSON: `/Users/veniameen/Projects/gotipe/output/playwright/notion-step1/menu-dom-inspect-2026-02-13T23-01-54-665Z.json`

## Split Docs

- `/Users/veniameen/Projects/gotipe/docs/notion-like-qa/notion-reference-step1/01-hover-gutter.md`
- `/Users/veniameen/Projects/gotipe/docs/notion-like-qa/notion-reference-step1/02-slash-heading-enter.md`
- `/Users/veniameen/Projects/gotipe/docs/notion-like-qa/notion-reference-step1/03-block-matrix-enter.md`
- `/Users/veniameen/Projects/gotipe/docs/notion-like-qa/notion-reference-step1/04-turn-into-list-transform.md`
- `/Users/veniameen/Projects/gotipe/docs/notion-like-qa/notion-reference-step1/05-parity-gap-list.md`

## Execution Scripts

- `/Users/veniameen/Projects/gotipe/e2e/notion-step1-deep-audit.mjs`
- `/Users/veniameen/Projects/gotipe/e2e/notion-step1-controls-inspect.mjs`
- `/Users/veniameen/Projects/gotipe/e2e/notion-step1-turn-into.mjs`
- `/Users/veniameen/Projects/gotipe/e2e/notion-step1-slash-anchor.mjs`
- `/Users/veniameen/Projects/gotipe/e2e/notion-step1-menu-dom-inspect.mjs`

## Status

- Completed in this batch:
- baseline deep capture with 13 recorded steps,
- measurable gutter behavior with ARIA labels and transition timings,
- slash menu container geometry captured from DOM (`role="dialog"`),
- block matrix screenshots for heading/list/quote/code + Enter,
- to-do slash transform scenario captured with screenshot.
- Next pass focus:
- expand `Turn into` actions toward full Notion parity set,
- deepen list-row micro-behavior capture (step 2),
- stabilize caret-to-menu geometry probes for long-page scenarios.
