---
"@gotipe/suggestions": patch
"@gotipe/theme": patch
---

A proposed new block's text stands in a span of its own (`.gotipe-sug-block-ins-text`, an inline
decoration over the phantom block's text), and `--gt-sug-block-ins-text-tint` (`0%`) tints it in
the lane's colour behind the text alone, line by line; with `--gt-sug-block-ins-tint: 0%` a host
fills the text instead of the whole row. A stale one stays unfilled. Defaults look as before.
