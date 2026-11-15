---
"@gotipe/core": patch
---

The JS engine writes block and mark `attrs` keys, and the keys of objects inside them, in code
point order, as the WASM engine does since D-82 (D-175). Before, `getJSON()` on JS kept the
order in which the keys were set, so the same document gave a different JSON string when the
engine changed. `getViewState()`, `getHTML()` and the documents of the `transaction` event
follow the same order. `decodeDocument()` returns attributes in this order too.
