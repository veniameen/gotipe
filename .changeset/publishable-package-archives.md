---
"@gotipe/ai": patch
"@gotipe/ai-ui": patch
"@gotipe/block-editor": patch
"@gotipe/block-editor-vue": patch
"@gotipe/collaboration": patch
"@gotipe/comments": patch
"@gotipe/core": patch
"@gotipe/export": patch
"@gotipe/i18n": patch
"@gotipe/markdown": patch
"@gotipe/migration": patch
"@gotipe/react": patch
"@gotipe/sdk": patch
"@gotipe/solid": patch
"@gotipe/suggestions": patch
"@gotipe/svelte": patch
"@gotipe/theme": patch
"@gotipe/versions": patch
"@gotipe/vue": patch
"@gotipe/wasm": patch
---

Include only built entrypoints, styles, and the existing license files in package archives. Fix the WASM archive and stylesheet exports; check every packed export and ESM/CommonJS entry before release.

Vue, Solid, and Svelte adapters now dispose editors that finish initializing after teardown. Vue exposes a reactive document renderer, and the Vue block editor mounts asynchronously supplied editors and renders their blocks.
