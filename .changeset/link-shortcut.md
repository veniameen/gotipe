---
"@gotipe/block-editor": patch
---

Mod+K opens the link field. The `Link` extension's key emits `openLinkDialog`, and now one
field answers it: the formatting bubble's over the selection, or, without a bubble, the
`FixedToolbar` one while its Link tool is on the bar. The field starts from the address of
the link under the selection. As in GoTipe Atlas, which draws the field only over selected
text, the key opens nothing at a caret alone, in a read-only editor or in a block without
marks (code, formulas). An app that opened its own link interface on `openLinkDialog` next to
`BlockEditor` or `FixedToolbar` now gets both: keep the listener only where those are not
rendered.
