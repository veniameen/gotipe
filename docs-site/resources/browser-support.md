---
title: Browser support
description: The browsers, screen widths and input methods GoTipe 0.1.0 was tested with, what it needs from the platform, and the known limits.
---

GoTipe targets current versions of the three browser engines. Its end-to-end suite runs in
Chromium, Firefox and WebKit; the details below are what the 0.1.0 release was checked
against.

## Tested engines

| Engine | Browser in the test run | Version |
|---|---|---|
| Chromium | Google Chrome, stable channel, desktop profile | not recorded |
| Firefox | Firefox, desktop profile | 159 |
| WebKit | Playwright's WebKit build, desktop Safari profile | 27.2 |

The same 905 scenarios ran in each engine. The failures in that run were timeouts on a
heavily loaded machine that passed when repeated, and one Firefox regression (a click
beside an empty list item put the caret in the next block), which was fixed and re-checked
with the affected tests in all three engines.

The suite covers typing with Unicode and emoji, Enter, Backspace and Delete, undo and
redo, the clipboard across blocks, drag and drop, lists, tables, images, code blocks, the
slash menu, bubble and block handle, Markdown round trips in `PageEditor`, comments and
suggestions, AI generation, cancel and errors, read-only mode, keyboard paths and focus,
and the light and dark themes.

## Screen widths

Layouts were checked at 320, 375, 768, 1024 and 1440 px and in a resizable container, in
light and dark. The page never scrolls sideways: wide tables and code scroll inside their
block. The editor adapts to its container rather than the window, so it also fits a
narrow side panel.

## Input methods

| Input | Status |
|---|---|
| Keyboard | All editing keys and menu keys; see [keyboard](/docs/ui/keyboard). |
| Mouse | Hover shows the block handle; dragging the grip uses the browser's drag and drop. |
| Touch and pen | Touching a block shows its handle. Hold the grip 300 ms, then drag; a short tap opens the block menu. Checked in Chrome with both editors, including cancel and undo. |
| IME | Native composition checked in Chromium; Unicode, ranges and undo checked in Firefox and WebKit. WebKit's Shift+Enter is handled as a line break. |
| Clipboard | Native copy, cut and paste, including selections across blocks. |

## Phones and tablets

The automated suite runs desktop profiles only; no phone, tablet or mobile browser was part
of the test run. What the code does for small touch screens:

- At a container width of 640 px or less, and again at 359 px or less, the views switch
  to smaller padding and type, and the `docs` outline hides.
- Menus are placed inside the visual viewport, the part of the page that an on-screen
  keyboard does not cover.
- Controls that appear on hover elsewhere, such as a file's Replace and Remove, stay
  visible on devices without hover.

## What GoTipe needs

- **JavaScript engine**: plain JavaScript, no WebAssembly. `PageEditor` always uses it.
- **WASM engine**: WebAssembly, and `'wasm-unsafe-eval'` in `script-src` under a Content
  Security Policy. It is required for [collaboration](/docs/collaboration/overview). See
  [engines](/docs/getting-started/engines).
- **CSS**: the theme uses container queries, `:has()`, `color-mix()` and `light-dark()`.
  GoTipe names no minimum browser versions; older engines miss parts of the styling.

## Printing

Printing hides the menus, the handle and the side panels, prints link addresses after
their text, and avoids page breaks inside code, quotes, tables and images.

## Known limits

- No real device, phone browser or tablet browser has been tested.
- Screen readers were not part of the test run; roles and names are checked in the
  browsers. See [accessibility](/docs/ui/keyboard#accessibility).
- Right-to-left text is not supported; see [i18n](/docs/ui/i18n#right-to-left).
- If the document changes while an IME composition is open, for example from a
  collaborator, the composition stops with a `COMPOSITION_CONFLICT` error that carries
  the typed text. GoTipe does not merge it back automatically.

## Related

- [Keyboard and accessibility](/docs/ui/keyboard) · [Theming](/docs/ui/theming)
- [Security](/docs/resources/security) · [Performance](/docs/resources/performance)
