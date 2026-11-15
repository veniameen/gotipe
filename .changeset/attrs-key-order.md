---
"@gotipe/wasm": patch
---

The Rust engine writes block and mark `attrs` keys in sorted order (D-82). Before, the keys
came out in the order of a hash map, so collaboration peers with the same document could
return different JSON: a table cell's `colspan` and `rowspan` or a link's `href` and `title`
in another order. Now every peer returns the same JSON for the same document. Reading is
unchanged: input in any key order is accepted.
