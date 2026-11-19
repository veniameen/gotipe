# @gotipe/suggestions

## 0.1.3

### Patch Changes

- c4b13c7: A proposed new block's text stands in a span of its own (`.gotipe-sug-block-ins-text`, an inline
  decoration over the phantom block's text), and `--gt-sug-block-ins-text-tint` (`0%`) tints it in
  the lane's colour behind the text alone, line by line; with `--gt-sug-block-ins-tint: 0%` a host
  fills the text instead of the whole row. A stale one stays unfilled. Defaults look as before.
  - @gotipe/core@0.1.5

## 0.1.2

### Patch Changes

- 7103833: A suggested new list item stands as its own item. A pending one is no longer drawn over the
  previous item's bullet, and a stale edit that adds lines shows its blocks at the hint's place,
  quiet and dashed (`.gotipe-sug-block-ins.gotipe-sug-stale`), instead of its text at the end of
  the previous line.
- Updated dependencies [5d8df93]
- Updated dependencies [7103833]
- Updated dependencies [7103833]
  - @gotipe/core@0.1.2
