---
"@gotipe/block-editor": patch
---

The `docs` view's outline scrolls the box the page scrolls in, such as a host's panel or a demo
window, and leaves the page around that box where it is. Before, a link scrolled every box up to
the page, and the heading could end up under the host's fixed header. With no such box, or one
that cannot scroll, the page scrolls as before and keeps to the heading's `scroll-margin-top`.
