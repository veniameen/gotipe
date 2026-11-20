# @gotipe/suggestions

## 0.1.3

### Patch Changes

- c4b13c7: A proposed new block's text stands in a span of its own (`.gotipe-sug-block-ins-text`, an inline
  decoration over the phantom block's text), and `--gt-sug-block-ins-text-tint` (`0%`) tints it in
  the lane's colour behind the text alone, line by line; with `--gt-sug-block-ins-tint: 0%` a host
  fills the text instead of the whole row. A stale one stays unfilled. Defaults look as before.
- A proposal still being written: `ReviewProposal.live`. As its text grows the host gives a new
  object with a longer `edits[].text` under the same `id`. Its state says `live: true`
  (`ProposalState.live`, absent of an ordinary proposal); its `status` is `"pending"` or
  `"stale"` by its anchor, as any proposal's (`reason` says why a stale one has no place), so
  `ProposalState.status` keeps the two values it had. Its `insertedChars` is 0, since it is
  never revealed; with no text yet its `position` and `insertEnd` are where the text will start. The last piece of its text carries the class `gotipe-sug-live`:
  an inline insertion itself, or a span over the last run of the last new block's text (the block
  itself when it has no text). `ReviewInput.liveText` reads its unfinished text, for a codec that
  settles an unfinished end.
- `ReviewProposal.order`: proposals that insert at the same point stand in ascending `order` (0
  when not given or not a finite number), equal ones as listed. A change of behaviour in a rare
  case: inline insertions of several proposals at one offset now stand in that order too; they
  used to stand in the order of their ids, which no rule described.
- `computeReviewDecorations` takes a `cache` (`createReviewCache()`, one per editor): a proposal or
  a comment is bound to the document again only when it, the document, its lane's colour, its
  place among the others or its being open changed, and what did not change keeps its state and
  decoration objects, an unchanged new block inside a grown group included. The cache is opaque
  (`ReviewCache` has nothing to read or set; an object not made by `createReviewCache()` is no
  cache). A new block's id and its group's key name its place, not its text, so a renderer keeps
  the block's element while the text grows; their form is the binding's own, not a contract.
  `revealDecorations` finds a proposal's decorations by `data-gotipe-proposal`.
- `LaneCursor.id` (the cursor's own key, for several cursors of one lane), `LaneCursor.name` (the
  name on its flag instead of the lane's) and `LaneCursor.compact` (a flag in one line).
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
