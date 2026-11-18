# @gotipe/i18n

## 0.1.3

### Patch Changes

- 9ca2225: Two host options of the image and file blocks (`media` on `PageEditor` and `BlockEditor`, or
  `MediaOptionsContext`), off by default:

  - `placeholder: "row"` draws an empty image or file block as one quiet row: a glyph, the block's
    kind ("Image", "File") and a secondary "Choose a file…" (`media.fileGroup`, `media.chooseFile`;
    sizes `--gt-media-row-h`, `-pad`, `-gap`, `-icon`, `-radius`, `-button-h`).
  - `captionName: true` shows an image's file name in the caption's place when it has no caption,
    quietly (`.gotipe-image-caption-hint`, `--gt-caption-hint-color`); nothing is written to the
    document.

## 0.1.2

### Patch Changes

- 7103833: A comment can be deleted from its card. `PageReviewProps.onDeleteComment(id)` adds a trash
  button at the end of the open comment card's head, labelled "Delete comment" (`review.deleteComment`,
  Russian included). Ask for confirmation inside the callback if you need it: `false` keeps the
  card, a throw is reported as `COMMENT_ACTION_FAILED`, and after success drop the comment from
  `comments`. Without the callback the card is unchanged.
