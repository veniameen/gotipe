---
"@gotipe/block-editor": patch
---

`iconPlacement="inline"`: the icon's wrapper is no longer `aria-hidden`, so a host's icon button
stays accessible, and its pointer and key events (mousedown, pointerdown, click, keydown,
beforeinput, input) stop at the wrapper: clicking it or pressing Enter or Backspace in it does not
move the caret, select or edit the title. It stays outside the title's text and the Markdown.
