---
"@gotipe/core": patch
---

`saveAsset` reports a host `saveAsset` that throws anything but a `GoTipeError` as
`ASSET_SAVE_FAILED`, with the asset's kind, name, media type, size and the cause in `details`.
A pasted or dropped file whose save failed used to show "Could not use the clipboard"
(`CLIPBOARD_FAILED`). A `GoTipeError` thrown by the host keeps its code.

`EditorHost.discardAsset({ src, name, kind })` is called for a file `saveAsset` stored that a
paste or drop then did not insert (a newer paste, a change during the upload, read-only, destroy,
or another file of the same paste failing), so the host can delete it. Without it nothing changes.
