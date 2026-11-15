---
"@gotipe/react": minor
"@gotipe/block-editor": minor
"@gotipe/theme": minor
"@gotipe/i18n": patch
---

The `docs` view has the block handle and heading anchors (GoTipe Atlas frame 2, D-30). The
handle works as in `notion`: it shows at the block under the pointer, in a 64 px gutter between
the outline and the text (`--gt-outline-gap` was 48 px, too narrow for it), and a container 640 px
wide or less keeps a 56 px rail on the left for it, so a finger can still drag a block.

Every heading the outline lists — h1–h3 at the top level, with text, except a leading h1 that is
the page's title — gets a quiet `#` after its last word. It shows under the pointer, and on the
heading a touch last chose; the heading keeps room for it at the end of its lines
(`--gt-anchor-room`), so showing it moves no letter. Its tip says «Copy link»; a click copies the
same link as «Copy link to block» — the page's address with `?gotipe-block=<id>`, which scrolls to
the heading when opened — and the tip says «Link copied». A refused clipboard is the editor's
`CLIPBOARD_FAILED` error, which «Copy link to block» now reports too instead of an unhandled
rejection. The anchor never takes Tab and stays out of the heading's accessible name; the
keyboard copies the link from the block menu. A heading with an anchor wraps as a paragraph
(`text-wrap: pretty`, `--gt-heading-wrap`): balanced, Chromium would carry the empty anchor onto
a line of its own. PageEditor headings in `docs` get anchors as well; its title does not.

`EditorContent` and `Editor` take `afterText(block)`: what a block with text shows after it, inside
its element, as a widget outside the document's text — custom block views get it with their
`content`. New exported type `AfterTextFn`. New theme tokens `--gt-anchor-gap`, `--gt-anchor-room`
and `--gt-heading-wrap`; `--gt-anchor-offset` is gone, `--gt-anchor-display` is `inline` in `docs`.
New block editor keys `block.copyHeadingLink` and `block.headingLinkCopied`.
