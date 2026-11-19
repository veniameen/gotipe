---
"@gotipe/core": patch
"@gotipe/react": patch
---

`EditorHost.discardAsset` is now called on every path where `saveAsset` stored a file the editor
did not insert: pastes and drops through the image paste rule (a newer paste, a changed document
or selection, read-only, destroyed, a refused or failed file of the same paste) and the image and
file blocks' upload, replace, crop and placeholder drop (the block is gone, the editor is read-only
or destroyed, a newer upload superseded it, or the block's source changed). A document changed
during an image paste is reported as `ASSET_SAVE_FAILED`, not `CLIPBOARD_FAILED`. New export
`discardSavedAsset(editor, asset)` from `@gotipe/core`.
