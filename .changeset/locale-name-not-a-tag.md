---
"@gotipe/block-editor": patch
---

A locale name that is no language tag no longer takes the editor down (D-220). With
`GoTipeI18nProvider locale="de_DE"` (a POSIX-style name) the counter line under the document and
the version history threw `RangeError` from `Intl.NumberFormat` and `Intl.DateTimeFormat` while
rendering, and without an error boundary React removed the whole `BlockEditor`. The counts, the
day and time of each version and the head of a comparison now use the browser's language for such
a name, as the time of comments already did (D-197).
