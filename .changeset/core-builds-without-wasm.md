---
"@gotipe/core": patch
---

An app that doesn't install `@gotipe/wasm` builds in Next.js, with Turbopack and with
`next build --webpack`, and needs no alias of `@gotipe/core` to `@gotipe/core/js`. The core
imports the package inside a `try` block, which webpack and Turbopack treat as an optional
import; before, Next.js stopped at `Module not found: Can't resolve '@gotipe/wasm'`.
`next build --webpack` lists the missing package as a warning. Without the package,
`engine: "auto"` runs on the JS engine and logs a warning, and `engine: "wasm"` rejects with
`WASM_INIT_FAILED`; the message now names `@gotipe/wasm` and says to install it or pass
`engine: "js"`. With the package installed nothing changes.
