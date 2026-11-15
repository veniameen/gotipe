---
title: Marks
description: Bold, italic, underline, strikethrough, inline code, links, highlight, text colour, superscript and subscript, with their commands, shortcuts and Markdown.
packages: ["@gotipe/core"]
license: MIT
---

Marks format a run of text inside a block. A span of text carries a list of marks, each with a `type` and optional `attrs`. Marks apply to rich-text blocks only; code blocks and math hold raw text without marks.

```demo
marks
```

## Extensions

`Mod` is Cmd on macOS and Ctrl elsewhere.

| Extension | Mark | Attributes | Shortcut | Presets |
| --- | --- | --- | --- | --- |
| `Bold` | `bold` | — | `Mod+B` | Minimal, Default, Full |
| `Italic` | `italic` | — | `Mod+I` | Minimal, Default, Full |
| `Underline` | `underline` | — | `Mod+U` | Default, Full |
| `Strikethrough` | `strikethrough` | — | `Mod+Shift+X` | Default, Full |
| `InlineCode` | `code` | — | `Mod+E` | Default, Full |
| `Link` | `link` | `href`, `title`, `target`, `rel` | `Mod+K` | Default, Full |
| `Highlight` | `highlight` | `color` | `Mod+Shift+H` | Default, Full |
| `TextColor` | `textColor` | `color` | — | Default, Full |
| `Superscript` | `superscript` | — | `Mod+.` | Full |
| `Subscript` | `subscript` | — | `Mod+,` | Full |

`PageEditor` includes all ten. None of the mark extensions has options. Letter and digit shortcuts follow the physical key, so they also work on non-Latin keyboard layouts.

```ts title="editor.ts"
import { createEditor } from "@gotipe/core";
import { Bold, Italic, Link, Paragraph, TextColor } from "@gotipe/core/extensions";

const editor = await createEditor({ extensions: [Paragraph, Bold, Italic, Link, TextColor] });
```

## Commands

Mark commands act on the current selection: every rich-text block it touches, or the stored marks for the next typed text when the selection is collapsed. Lists, tables, dividers, images and code blocks are passed over, while the list items and table cells inside a selection are formatted.

```ts
editor.chain().toggleBold().run();
editor.chain().setMark("textColor", { color: "#2c62d4" }).run();
editor.chain().setLink("https://example.com/docs").run();
```

| Command | Description |
| --- | --- |
| `toggleBold()`, `toggleItalic()`, `toggleUnderline()`, `toggleStrikethrough()`, `toggleCode()`, `toggleSuperscript()`, `toggleSubscript()` | Removes the mark when every selected character has it, adds it otherwise. |
| `toggleHighlight(color?)` | The same for `highlight`, with an optional colour. |
| `toggleMark(type, attrs?)` | The same for any mark. |
| `setMark(type, attrs?)` | Adds a mark to the selection; text that already has it takes the new attributes. |
| `unsetMark(type)` | Removes a mark from the selection. |
| `addMark(type, from?, to?, attrs?)` | Adds a mark to a range of the block that holds the selection anchor (UTF-16 offsets). |
| `removeMark(type, from?, to?)` | Removes a mark from such a range. |
| `setLink(href, target?)` | Adds a link or changes the address of the selected one; `target` defaults to `"_blank"`. |
| `removeLink()` | Removes links from the selection. |
| `clearFormatting()` | Removes every mark from the selection. |

`editor.isActive("bold")` tells whether a mark is active at the selection.

### Change an attribute

A mark replaces a mark of the same type, so `setMark` changes a link address or a colour in one undo step, also where only part of the selection had the mark:

```ts
editor.chain().setMark("textColor", { color: "#c4382f" }).run();
editor.chain().setLink("https://example.com/new").run();
```

The new mark has exactly the attributes you pass, plus the declared defaults of the ones you leave out; other attributes of the old mark, such as a link `title`, are not kept.

## Input rules

`Bold`, `Italic`, `Strikethrough` and `InlineCode` format text typed as `**text**`, `*text*`, `~~text~~` and `` `text` ``. When you type the closing delimiter right before the caret, anywhere in a block, the delimiters disappear and the text between them gets the mark; the text you type next is not formatted. One undo brings the delimiters back.

The opening delimiter has to start a word: it stands at the start of the block or after a space or punctuation, so `2*3*` and `snake_case*x*` stay as typed. The text between the delimiters may not start or end with a space or contain the delimiter character.

Like the block shortcuts (`# `, `- `), these rules run for typed text only: text committed by an IME composition, such as Japanese or Chinese input, is not converted.

## Links

| Attribute | Type | Default | Description |
| --- | --- | --- | --- |
| `href` | `string` | required | Address of the link. |
| `title` | `string` | — | Title, written to Markdown and HTML. |
| `target` | `string` | `"_blank"` | Stored only; not used by the views or exports. |
| `rel` | `string` | `"noopener noreferrer"` | Stored only; not used by the views or exports. |

Commands write the defaults: a link made with `setLink` or `setMark("link", { href })` stores `target` and `rel`.

Links never navigate the page by themselves. While editing, a click places the caret and Cmd/Ctrl+click (or a middle click) opens the link; in read-only mode any click opens it. The editor opens links through `host.openLink`, or `window.open` without a host. Only `http:`, `https:`, `mailto:` and relative addresses are opened or rendered; any other scheme is blocked with `LINK_BLOCKED`.

`Mod+K` emits the `openLinkDialog` event for your own link UI:

```ts
import { toSafeHref } from "@gotipe/core";

editor.on("openLinkDialog", () => {
  const href = toSafeHref(window.prompt("Link address") ?? "");
  if (href) editor.chain().setLink(href).run();
});
```

In `BlockEditor` the bubble menu's link button and `Mod+K` open a field that validates the address the same way; `FixedToolbar` opens its own field when there is no bubble. The key opens a field only over selected text: with a caret alone it opens nothing.

> [!NOTE]
> `BlockEditor` and `FixedToolbar` listen to `openLinkDialog` themselves. Listen to it for your own link interface only where you do not render them, or both open.

## Colours

`highlight` and `textColor` store a CSS colour in `color`. The editor UI offers a palette, exported from `@gotipe/core`:

| Palette | Names and stored values |
| --- | --- |
| `DOCUMENT_TEXT_COLORS` | Gray `#66665f`, Red `#c4382f`, Amber `#9a6500`, Green `#2b7547`, Blue `#2c62d4` |
| `DOCUMENT_HIGHLIGHT_COLORS` | Yellow `#fbf0ce`, Green `#e1ece5`, Blue `#e6ecfa`, Red `#f8e7e6`, Gray `#ededed` |

A mark stores the colour as it looks on a light page, so exports print it as it is. The editor draws a palette colour through its theme token (`--gt-tc-*` for text, `--gt-bg-*` for highlight), so it follows light and dark mode; `documentColorStyle(value)` returns that CSS value for your own renderer. Any other colour is drawn as stored.

Colours are validated with `toSafeColor`: hex colours, colour names and `rgb()`, `rgba()`, `hsl()` and `hsla()` pass; declarations, URLs and CSS variables are dropped.

`toggleHighlight()` without a colour stores a highlight with no `color`, drawn as a plain `<mark>` in the theme's highlight colour.

## Superscript and subscript

Both marks declare the exclusive group `script`, so text carries at most one of them: applying superscript removes subscript from that text, and at a caret switching one on switches the other off.

## Markdown

| Mark | Written as | Also read from |
| --- | --- | --- |
| `bold` | `**text**` | `__text__`, `<strong>`, `<b>` |
| `italic` | `*text*` | `_text_`, `<em>`, `<i>` |
| `strikethrough` | `~~text~~` | `~text~`, `<s>`, `<del>` |
| `code` | `` `text` `` | — |
| `link` | `[text](href "title")`, `<https://…>` or a bare address | Autolinks and GFM bare addresses |
| `underline` | `<u>text</u>` | — |
| `highlight` | `<mark>text</mark>` or `<mark style="background:#fbf0ce">text</mark>` | `background-color` in the style |
| `textColor` | `<span style="color:#c4382f">text</span>` | — |
| `superscript` | `<sup>text</sup>` | — |
| `subscript` | `<sub>text</sub>` | — |

When delimiters cannot express an edited span, such as emphasis that starts with a space, the writer uses `<strong>`, `<em>` and `<s>` instead. `target` and `rel` of a link are not written. Reference links, footnote references, inline images and other inline HTML are kept as verbatim text with the `mdRaw` mark, which is not editable as formatting. See [Markdown](/docs/conversion/markdown).

## Related

- [Commands](/docs/concepts/commands): selections and the chain.
- [Menus](/docs/ui/menus): the bubble menu, colour picker and link field.
- [Host](/docs/concepts/host): `openLink` and `onError`.
- [Theming](/docs/ui/theming): the colour tokens.
