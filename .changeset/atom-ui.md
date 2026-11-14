---
"@gotipe/core": minor
"@gotipe/react": minor
"@gotipe/vue": minor
"@gotipe/block-editor": minor
"@gotipe/theme": minor
"@gotipe/i18n": minor
---

Mentions, emoji and formulas get their interface (GoTipe Atlas, frames 22–24).

- `@gotipe/react` and `@gotipe/vue` draw every atom as one non-editable element
  (`data-gotipe-atom`, `data-type`) that keeps its fallback text hidden for offsets and screen
  readers: a mention chip with initials or the page glyph, a custom emoji image with its name in
  a tooltip, an inline image, and a formula typeset as MathML in the document font; TeX that
  cannot be read shows on a red tint with the reason. The caret steps over atoms, Backspace
  takes them whole, a click beside a chip puts the caret there, and an input method composes
  after it. Formulas are drawn when the view has a TeX reader (`MathRendererContext` in React,
  the `math` prop in Vue); without one they show their TeX and `@gotipe/core/math` is not
  loaded. React exports `AtomView`, `MathRendererContext`, `renderMath`, `mathErrorText` and
  `textUnits`; Vue exports `VueMath`.
- The React math block draws the formula and shows its TeX while the caret is in the block.
- New optional entry `@gotipe/core/math`: GoTipe's own TeX → MathML converter (`parseTex`,
  `mathToDOM`, `mathToString`, `isMathElement`) with errors that name their reason and place,
  and no raw markup. `@gotipe/core/emoji` groups the table by category (`EMOJI_CATEGORIES`,
  `EMOJI_TABLE`, `emojiItems`, `findEmoji`, `EmojiItem.category`) and `searchEmoji` takes
  localized names; `@gotipe/core/emoji/ru` exports `EMOJI_NAMES_RU`.
  `@gotipe/core/extensions` exports `toSafeImageSrc`. The DOM selection maps the edge of an
  atom element to the position beside it.
- `@gotipe/block-editor`: `atomExtensions()` with the «@» list (`MentionSuggestion`), the «:»
  list (`EmojiSuggestion`), «/» → Emoji with the emoji picker (`EmojiCommand`) and «/» → Inline
  formula with `$…$` and the formula popover (`InlineMathCommands`). `BlockEditor` and
  `PageEditor` take `mentions` and `emoji`; `AtomUI`, `MentionMenu`, `EmojiMenu`,
  `EmojiPicker`, `MathPopover`, `AtomProvider` and `requestAtomUI` are exported. The slash menu
  and the lists put `aria-activedescendant` on the focused editor element.
- `@gotipe/theme`: `theme/atoms.css` and `theme/atom-menus.css`; new size tokens
  `--gt-chip-pad-x`, `--gt-menu-avatar-inset`, `--gt-emoji-*`, `--gt-math-*`.
- `@gotipe/i18n`: strings of the lists, the picker, the popover and formula errors.
