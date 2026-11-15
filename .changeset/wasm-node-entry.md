---
"@gotipe/wasm": patch
---

`@gotipe/wasm` loads in Node. A `node` export condition points at a small entry whose default
export reads `gotipe_wasm_bg.wasm` from the installed package, because Node cannot fetch the
binary's `file:` URL; an input you pass goes through unchanged. `createEditor` from
`@gotipe/core` therefore runs the Rust engine in Node with its default loader. Browsers and
bundlers keep the `import` entry: the browser bundle does not change.
