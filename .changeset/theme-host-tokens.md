---
"@gotipe/theme": patch
---

More of the look is reachable through tokens set on a container:

- Palette aliases such as `--gt-comment-soft` and `--gt-ai-ghost` are resolved again on
  `[data-gt-view]`, so base colours a host sets on a page container reach them. To set an alias
  itself, set it on the editor root.
- `data-gt-narrow="off"` on the editor root or any ancestor switches off the sizes of a narrow
  container (up to 640 px); the layout of a narrow container (docs outline, history screens,
  find bar) still applies.
- New tokens, defaults equal to today's look: `--gt-check-fill`, `--gt-check-line`;
  `--gt-card-name-size`, `--gt-card-name-weight`, `--gt-card-button-size`; `--gt-sug-ins-bar`
  and `--gt-sug-ins-underline`, `-style`, `-thickness`, `-offset` (a text underline for a proposed
  insertion); `--gt-sug-changed-bar`, `--gt-sug-changed-bar-width`; `--gt-image-radius`,
  `--gt-image-ring`, `--gt-image-ring-color`, `--gt-caption-color`, `--gt-caption-size`,
  `--gt-caption-leading`, `--gt-image-empty-bg`.
- Styles for `.gotipe-review-card-delete`, a `.gotipe-page-head` inside a page and
  `.gotipe-slash-menu-item-description`.
