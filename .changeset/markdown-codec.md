---
"@gotipe/markdown": minor
---

New package: lossless GFM Markdown ⇄ GoTipe document codec. An unchanged file round-trips byte-for-byte; after an edit only the changed top-level blocks are rewritten. Front matter, HTML, footnotes and link definitions are kept as is; block ids survive re-parsing; a text ⇄ Markdown map for anchors.
