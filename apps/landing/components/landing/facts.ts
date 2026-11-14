/**
 * Numbers the landing states. Each has a source in the repository; update them together.
 * - BROWSER_SCENARIOS: the Playwright suite (docs/22-release-readiness.md, «…/905» runs).
 * - COMMONMARK: the own parser against the reference AST (docs/22-release-readiness.md, R-015).
 * - JS_ENGINE_GZIP: core + Markdown graph, 116,181 bytes gzip-9 on the 2026-11-14 tree
 *   (docs/development/javascript-budgets.md, `pnpm check:bundles`).
 * - WASM_ENGINE_GZIP: gotipe_wasm_bg.wasm, 300,804 bytes gzip-9 on the same tree
 *   (docs/development/wasm-budget.md, scripts/check-wasm-size.mjs).
 */
export const FACTS = {
  BROWSER_SCENARIOS: "905",
  COMMONMARK: "652 / 652",
  JS_ENGINE_GZIP: "~115 KB",
  WASM_ENGINE_GZIP: "~300 KB",
} as const;
