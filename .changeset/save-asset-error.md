---
"@gotipe/core": patch
---

`saveAsset` reports a host `saveAsset` that throws anything but a `GoTipeError` as
`ASSET_SAVE_FAILED`, with the asset's kind, name, media type, size and the cause in `details`.
A pasted or dropped file whose save failed used to show "Could not use the clipboard"
(`CLIPBOARD_FAILED`). A `GoTipeError` thrown by the host keeps its code.
