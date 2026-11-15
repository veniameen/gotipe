---
"@gotipe/core": patch
---

Removed the internal `clipboard/index.ts` barrel that nothing imported (D-173, the core part).
`ClipboardHandler` stays where the editor takes it from; no public entry point changes.
