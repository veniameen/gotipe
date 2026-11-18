---
"@gotipe/react": patch
"@gotipe/i18n": patch
"@gotipe/theme": patch
---

Two host options of the image and file blocks (`media` on `PageEditor` and `BlockEditor`, or
`MediaOptionsContext`), off by default:

- `placeholder: "row"` draws an empty image or file block as one quiet row: a glyph, the block's
  kind ("Image", "File") and a secondary "Choose a file…" (`media.fileGroup`, `media.chooseFile`;
  sizes `--gt-media-row-h`, `-pad`, `-gap`, `-icon`, `-radius`, `-button-h`).
- `captionName: true` shows an image's file name in the caption's place when it has no caption,
  quietly (`.gotipe-image-caption-hint`, `--gt-caption-hint-color`); nothing is written to the
  document.
