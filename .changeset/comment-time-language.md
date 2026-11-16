---
"@gotipe/block-editor": patch
---

`CommentSidebar` writes the time of a thread and of its replies in the interface's language,
the locale of `GoTipeI18nProvider`, rather than the browser's (D-197): a Russian interface on
an English system shows «15.11.2026, 22:00:00», not "11/15/2026, 10:00:00 PM". A locale name
that is no language tag (`de_DE`) keeps the browser's way of writing time.
