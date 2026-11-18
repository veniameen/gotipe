---
"@gotipe/react": patch
"@gotipe/block-editor": patch
---

The image and file placeholders take options: `media={{ links, inlineErrors }}` on `BlockEditor`
and `PageEditor` (or `MediaOptionsContext` from `@gotipe/react`). `links: false` hides "By link"
(catalogs of `host.imageSources` stay); `inlineErrors: false` shows no failure text in the block,
and the failures shown only there until now are reported instead: a wrong address as
`LINK_BLOCKED`, an image changed during a crop as `ASSET_SAVE_FAILED`, a failed catalog search as
`ASSET_RESOLVE_FAILED`. Both default to `true`: nothing changes.
