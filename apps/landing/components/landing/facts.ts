/**
 * Numbers the landing states. Each has a source in the repository; update them together.
 * - BROWSER_SCENARIOS: the Playwright suite runs 965 scenarios in Chromium and the 949 of them
 *   that are not IME-only in Firefox and WebKit too (docs/22-release-readiness.md, 2026-11-16:
 *   "Chromium 965/965, Firefox and WebKit 949"); the landing names the ones all three run.
 * - COMMONMARK: the own parser against the reference AST (docs/22-release-readiness.md, R-015).
 * - JS_ENGINE_GZIP: core + Markdown graph, 127,296 bytes gzip-9 on the 2026-11-16 tree (72271ce,
 *   `pnpm check:bundles`: headless-core-and-markdown; docs/development/javascript-budgets.md).
 * - WASM_ENGINE_GZIP: gotipe_wasm_bg.wasm, 300,183 bytes gzip-9 on the same tree
 *   (docs/development/wasm-budget.md, scripts/check-wasm-size.mjs).
 */
export const FACTS = {
  BROWSER_SCENARIOS: "949",
  COMMONMARK: "652 / 652",
  JS_ENGINE_GZIP: "~127 KB",
  WASM_ENGINE_GZIP: "~300 KB",
} as const;
