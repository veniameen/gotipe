---
"@gotipe/react": patch
---

A click on a file block's name opens the file once (D-210). In read-only mode and on Cmd/Ctrl+click
while editing, `host.openLink` was called twice for one click (without a host, two tabs opened): the
editor's link handler took the card's name as a text link and the card opened the file itself. The
card now keeps its click from the editor's handler, in the read-only view and in
`@gotipe/react/media` alike. A plain click while editing and a middle click open the file once, as
before. The Vue file card draws its name as a button and was not affected.
