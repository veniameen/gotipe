---
title: Theming
description: The four views, light and dark mode, the theme API, the CSS files of @gotipe/theme and how to pass your application's colours through --gt-* tokens.
packages: ["@gotipe/theme"]
license: Commercial
---

The colours, fonts, sizes and radii of the ready editors are `--gt-*` custom properties. A
view (`notion`, `docs`, `modern`, `minimal`) is a set of these tokens over the same markup,
and light and dark are two palettes of them. You change the look by overriding tokens, not
by replacing stylesheets.

## Install

```sh
npm install @gotipe/theme
```

| File | Contents |
|---|---|
| `@gotipe/theme/base.css` | The document in every view: text, blocks, lists, tables, code, print and reduced-motion rules |
| `@gotipe/theme/theme.css` | Menus, panels, review cards and the loading, error and read-only states |
| `@gotipe/theme/tokens.css` | Only the tokens: light and dark palettes and the views |
| `@gotipe/theme/page.css` | `base.css` and `theme.css` in one import, kept for older imports |

```ts title="main.ts"
import "@gotipe/theme/base.css";
import "@gotipe/theme/theme.css";
```

`@gotipe/block-editor/styles` loads `base.css` and `theme.css`, everything `BlockEditor` and
`PageEditor` draw. The headless MIT packages ship no CSS; with them, style `.gotipe-content`
yourself or use `tokens.css` for your own UI.

## Views

```demo
views
```

Pass `view` to `BlockEditor` or `PageEditor`; it becomes `data-gt-view` on the editor root.

| View | Column | Body | Title | Also |
|---|---|---|---|---|
| `notion` (default) | 680 px | 15/24 px | 32 px | Block handle in the gutter |
| `docs` | 680 px | 14/22 px | 28 px | Outline of headings beside the text, line numbers in code, block handle in the gutter, `#` anchor after each heading |
| `modern` | 680 px | 15/24 px | 28 px | Less space above the title, no handle |
| `minimal` | 640 px | 14/22 px | 22 px | Tighter spacing and 24 px side padding, no handle |

The editor root is a size container. In a container 640 px wide or less, the side padding,
heading sizes and title shrink and the `docs` outline hides; at 359 px or less they shrink
again. There `notion` and `docs` keep a rail of `--gt-handle-rail` (56 px) on the left for the
block handle, in `BlockEditor` and `PageEditor` alike; a table's row handle stands in it too. A
container that keeps less room than `--gt-handle-offset` left of the text shows no block handle:
it would cover the text. In `docs`,
`--gt-outline-gap` (64 px) is the gutter the handle stands in, `--gt-anchor-display` shows the
heading anchors (`none` hides them) and `--gt-anchor-room` is the room a heading keeps for its
anchor at the end of its lines. `--gt-heading-wrap` is how headings wrap: `balance`, so the last
line is not one lone word, and `pretty` in `docs`, where a balanced heading would carry its anchor
away; the page title wraps balanced in every view. The editor takes its width from its parent: in
a layout that sizes by content, give the parent a width.

A narrow container sets its sizes on the editor root's children, so they win over sizes you set
on the root itself. `data-gt-narrow="off"` on the editor root or on any ancestor switches the narrow
sizes off at both steps: the view's wide sizes, or yours on `.gotipe-page .gotipe-block-editor`,
apply at any width. What fits the layout to a narrow container still applies: the `docs` outline
hides, version history becomes two screens and the find bar wraps. Without the attribute nothing
changes. `PageEditor` and `BlockEditor` set it for you with `narrow={false}`.

## Light and dark

The light palette is declared on `:root` and `[data-theme="light"]`, the dark one on
`[data-theme="dark"]`. When `<html>` has no `data-theme`, the dark palette follows
`prefers-color-scheme: dark`. Any element with `data-theme` gets its own palette, so an
editor inside a dark panel can be dark on a light page.

`@gotipe/theme` manages the attribute for you:

```ts title="theme.ts"
import { getTheme, onThemeChange, setTheme } from "@gotipe/theme";

const stopFollowing = setTheme("system"); // follows the OS until you choose light or dark
const unsubscribe = onThemeChange((mode, resolved) => console.log(mode, resolved));
console.log(getTheme()); // { mode: "system", resolved: "dark" }
```

| Function | Description |
|---|---|
| `setTheme(mode, root?)` | `"light"`, `"dark"` or `"system"` on `root` (default `<html>`). Sets `data-theme` and the palette. Returns a cleanup that stops following the OS. |
| `getTheme(root?)` | `{ mode, resolved }` for that root. Safe during server rendering. |
| `onThemeChange(listener, root?)` | Calls `listener(mode, resolved)` after each change; returns an unsubscribe function. |
| `applyTheme(config, root?)` | Writes `config.tokens` as `--gt-*` properties on `root`; keys without the prefix get it. |
| `defineTheme(config)` | Returns `config` typed as `ThemeConfig`. |
| `lightTheme`, `darkTheme` | The palettes as `ThemeConfig` objects. |

Each root keeps its own mode and listeners. `ThemeToggle` from `@gotipe/block-editor` is a
three-way switch that always acts on `<html>`; `BlockEditor` shows it with
`showThemeToggle`.

## Your colours

Colours, fonts, radii and shadows inherit. Set them on a container around the editor, and
they reach the text, the menus and the review cards. Sizes belong to the view, so override
them on the editor root itself:

```css title="editor-theme.css"
.app-editor {
  --gt-page-bg: var(--app-canvas);
  --gt-text: var(--app-text);
  --gt-text-2: var(--app-text-muted);
  --gt-line: var(--app-border);
  --gt-accent: var(--app-brand);
  --gt-focus: var(--app-focus-ring);
  --gt-selection: var(--app-selection);
  --gt-font-ui: var(--app-font);
  --gt-font-mono: var(--app-font-mono);
  --gt-radius-control: var(--app-radius);
}

/* setTheme always sets data-theme, also in "system" mode */
[data-theme="dark"] .app-editor {
  --gt-accent: var(--app-brand-dark);
}

/* The editor root carries the view; this also reaches the root inside PageEditor. */
.app-editor .gotipe-block-editor {
  --gt-page-width: 760px;
  --gt-body-size: 16px;
}
```

A part colour such as `--gt-comment-soft`, `--gt-ai-ghost` or `--gt-check-fill` is unset by
default: the rule that uses it falls back to a base colour (`--gt-comment-tint`, `--gt-text-3`,
`--gt-ink`) where it is drawn, so it follows the base colours you set on a container. Set the part
token itself on any container to override it.

Menus that open outside the editor, such as the formatting bubble and the table menus,
render in a layer on `<body>`. That layer copies the editor's computed `--gt-*` values,
font, colour scheme and direction, so tokens you set on a container apply there too.

| Group | Tokens |
|---|---|
| Surfaces and text | `--gt-page-bg`, `--gt-sunken`, `--gt-overlay`, `--gt-text`, `--gt-text-2`, `--gt-text-3`, `--gt-fill-1`…`3` |
| Lines and accents | `--gt-line`, `--gt-line-strong`, `--gt-line-control`, `--gt-line-active`, `--gt-ink`, `--gt-accent`, `--gt-focus`, `--gt-selection` |
| States | `--gt-success`, `--gt-warning`, `--gt-danger`, `--gt-comment` and their `-tint` forms |
| Type and shape | `--gt-font-ui`, `--gt-font-mono`, `--gt-radius-control`, `--gt-radius-overlay`, `--gt-shadow-overlay` |
| Document colours | `--gt-tc-gray` … `--gt-tc-blue` (text), `--gt-bg-yellow` … `--gt-bg-gray` (highlight) |
| Code and review | `--gt-syn-keyword`, `--gt-syn-string`, `--gt-syn-number`, `--gt-syn-type`, `--gt-syn-comment`, `--gt-syn-punct`; `--gt-track-1`…`6` |
| View sizes | `--gt-page-width`, `--gt-page-pad-x`, `--gt-body-size`, `--gt-body-leading`, `--gt-title-size`, `--gt-h1-size`… |

### Parts

These tokens style one part each. A size (`-size`, `-width`, `-bar`, `-offset`, `-thickness`,
`-gap`, `-pad`, `-rule`, `-mix`) is set on the editor root; a colour on any container. "Unset"
means the rule falls back to the base token shown, resolved where the part is drawn; such a token
can be set on any container.

| Token | Default | Controls |
|---|---|---|
| `--gt-check-fill` | unset: `--gt-ink` | Fill of a checked task box |
| `--gt-check-line` | unset: `--gt-line-control` | Border of an empty task box |
| `--gt-check-mark` | an SVG in `--gt-ink-text` (white in light, dark in dark) | The tick of a checked task box, a `url()` image; with a light `--gt-check-fill`, give it a tick of a dark colour, and with a fill that stays dark in both themes, a white tick |
| `--gt-comment-soft` | unset: `--gt-comment-tint` | Background of commented text |
| `--gt-ai-ghost` | unset: `--gt-text-3` | Colour of the model's text offered at the caret |
| `--gt-card-name-size` | `var(--gt-ui-size)` (13 px) | Name of the author or lane in a review card's head |
| `--gt-card-name-weight` | `var(--gt-weight-medium)` | Its weight |
| `--gt-card-button-size` | `var(--gt-ui-size)` (13 px) | Text of a review card's buttons |
| `--gt-sug-ins-bar` | `var(--gt-rule)` (2 px) | Bar in the lane's colour along the bottom of a proposed insertion's tint; `0px` removes it |
| `--gt-sug-ins-underline` | `none` | `underline` draws a text underline under a proposed insertion, in the lane's colour |
| `--gt-sug-ins-underline-style` | `solid` | Its style: `solid`, `dotted`, `dashed`, `wavy` |
| `--gt-sug-ins-underline-thickness` | `var(--gt-rule)` (2 px) | Its thickness |
| `--gt-sug-ins-underline-offset` | `var(--gt-underline-offset)` (0.2em) | Its offset from the font's underline position |
| `--gt-sug-ins-line-mix` | `100%` | Share of the lane's colour in an insertion's bar or underline and in a new block's underline; `75%` makes the line paler |
| `--gt-sug-block-ins-tint` | unset: `--gt-track-tint` (12%) | Share of the lane's colour in a proposed new block's fill (in a new table, laid over each cell's own fill, the head's included); `0%` removes the fill |
| `--gt-sug-block-ins-underline` | `underline` | `none` drops the underline of a proposed new block's text |
| `--gt-sug-block-ins-underline-thickness` | `var(--gt-underline)` (1 px) | Its thickness |
| `--gt-sug-block-ins-text-tint` | `0%` | Share of the lane's colour behind a proposed new block's text alone, line by line (`.gotipe-sug-block-ins-text`); with `--gt-sug-block-ins-tint: 0%` the text is filled instead of the row |
| `--gt-sug-ins-radius` | unset: `--gt-radius-inline` | Corners of an inserted text's fill |
| `--gt-sug-block-ins-text-radius` | unset: `--gt-sug-ins-radius` | Corners of that fill behind a proposed new block's text |
| `--gt-sug-stale-color` | unset: `--gt-text-2` | Text colour of a stale proposal, in the text and as a new block |
| `--gt-sug-stale-line` | unset: `--gt-line-control` | Colour of its underline |
| `--gt-sug-stale-underline-style` | `dashed` | Its style |
| `--gt-sug-stale-underline-thickness` | `var(--gt-underline)` (1 px) | Its thickness |
| `--gt-sug-stale-active-fill` | unset: the lane's active tint | Fill of a stale proposal while its card is open; `transparent` keeps it unfilled |
| `--gt-sug-del-active-fill` | unset: the lane's active tint | Fill of a proposed deletion's struck text while its card is open, apart from the insertion's; `transparent` keeps it unfilled |
| `--gt-sug-stale-check-line` | unset: `--gt-line-control` | Border of the task box of a stale proposed task item |
| `--gt-sug-changed-bar-width` | `var(--gt-rule)` (2 px) | Bar at the left edge of a block a proposal changes; `0px` removes it |
| `--gt-sug-changed-bar` | unset: the lane's colour | Colour of that bar |
| `--gt-lane-pointer-size` | 16 px | A lane's cursor as a pointer (`reviewLaneCursor="pointer"`): size of the arrow, whose tip is the cursor's place; its colour is the lane's (`--gt-track`) |
| `--gt-lane-pointer-chip-x`, `--gt-lane-pointer-chip-y` | 10 px, 14 px | Offset of the name chip from the arrow's tip, right and down |
| `--gt-lane-pointer-chip-radius` | `var(--gt-radius-inline)` (4 px) | Corners of that chip |
| `--gt-review-card-gap` | 8 px | Space between a card by the text and its row, above or below it (`reviewCardPlacement`); a length in px |
| `--gt-lane-pointer-at` | `0px` | Where the arrow's tip stands in the row, from its top: `100%` is the row's bottom, `calc(100% - 2px)` just above it; the chip moves with the tip |
| `--gt-lane-pointer-tip-x`, `--gt-lane-pointer-tip-y` | unset: 3/16 and 1.75/16 of `--gt-lane-pointer-size` | Where the tip lies inside the arrow's box, from its top left; set them for a host's own arrow (`reviewLanePointer`) |
| `--gt-lane-pointer-outline` | `currentColor` | Outline of the built-in arrow; the page's colour (`var(--gt-page-bg)`) sets it apart from the text under it |
| `--gt-lane-pointer-outline-width` | unset: `var(--gt-icon-stroke)` (1.5) | Width of that outline, in the arrow's 16-unit box |
| `--gt-sug-live-caret-width` | unset: no caret | Width of a typing caret at the end of a proposal that is still being written (`live`), on its last inserted piece (`.gotipe-sug-live`); `2px` draws one. It is a shadow, so it takes no room and moves no text |
| `--gt-sug-live-caret-color` | unset: the lane's colour | Colour of that caret |
| `--gt-lane-cursor-move` | unset: `var(--gt-duration-fast)` (100 ms) | Time over which the cursor of a growing proposal goes to its text's new end (`.gotipe-lane-cursor[data-glide]`); `0s` moves it at once. A scroll of the page or a change of the page's width always takes it along at once, and so does reduced motion |
| `--gt-lane-chip-gap` | unset: `var(--gt-space-1)` (4 px) | Space between the name and the label of a cursor's flag in one line (`LaneCursor.compact`, `.gotipe-lane-cursor[data-compact]`) |
| `--gt-lane-chip-flip-x`, `--gt-lane-chip-flip-y` | unset: `0`, `var(--gt-toolbar-gap)` (2 px) | A compact flag with no room right of its cursor (`[data-chip-side="left"]`) stands left of it, above the row: how far its right edge is left of the cursor, and its bottom above the row |
| `--gt-sug-replace-gap` | `0px` | Space between a struck deletion and the insertion that replaces it |
| `--gt-image-radius` | `var(--gt-radius-block)` (8 px) | Corners of an image |
| `--gt-image-ring` | `0px` | Width of a ring around an image, which keeps a light image apart from the page |
| `--gt-image-ring-color` | unset: `--gt-line` | Its colour |
| `--gt-caption-color` | unset: `--gt-text-2` | Colour of an image's caption |
| `--gt-caption-size`, `--gt-caption-leading` | `var(--gt-small-size)`, `var(--gt-small-leading)` | Its size and line height; `--gt-caption-gap` is the space above it |
| `--gt-image-empty-bg` | unset: `--gt-sunken` | Background of an empty image or file block (upload or link) |
| `--gt-media-row-h`, `--gt-media-row-pad`, `--gt-media-row-gap` | 48 px, `0 12px`, 8 px | The empty block as a row (`media.placeholder: "row"`): height, padding and gaps |
| `--gt-media-row-icon`, `--gt-media-row-radius`, `--gt-media-row-button-h` | 20 px, `var(--gt-radius-block)`, 24 px | Its glyph, corners and button height |
| `--gt-media-row-label-size` | `var(--gt-ui-size)` (13 px) | Size of the row's label |
| `--gt-media-row-button-size`, `--gt-media-row-button-pad`, `--gt-media-row-button-min-w` | `var(--gt-ui-size)` (13 px), `var(--gt-button-pad)` (`0 10px`), `auto` | Its button's text size, padding and least width |
| `--gt-page-icon-inline`, `--gt-page-icon-inline-gap` | `1em`, `0.3em` | The page's glyph in the title's row (`iconPlacement="inline"`, `.gotipe-page-title-icon`) and its gap to the text |
| `--gt-caption-hint-color` | unset: `--gt-text-3` | The file name an image without a caption shows with `media.captionName` |
| `--gt-list-item-gap` | `var(--gt-flow-list)` (4 px) | Space between two items of a list, task lists included |
| `--gt-list-item-inset` | `0px` | Inset of a list item from the list's edge: its dot, number or task box moves with its text |
| `--gt-list-item-text-inset` | `0px` | Inset of a list item's content alone: its text (and a task's box) moves, its dot and number stay where they are |
| `--gt-flow-between-lists` | `var(--gt-flow)` (8 px) | Space before a list that follows another list, as a numbered list after a task list; `0px` joins them |
| `--gt-flow-after-h1-table`, `--gt-flow-after-h2-table`, `--gt-flow-after-h3-table` | `var(--gt-flow-after-h1)`, `-h2`, `-h3` (10, 8, 4 px) | Space before a table right under a heading of that level (`-h3` for h3 to h6; `-h1` also under the page title) |
| `--gt-table-line` | unset: `--gt-line` | Colour of a table's row lines, column lines and frame |
| `--gt-table-row-rule` | `var(--gt-hairline)` (1 px) | Width of the line under each row but the last, the head's included; `0px` removes the row lines |
| `--gt-table-col-rule`, `--gt-table-col-rule-style` | `0px`, unset: `none` | Width and style of the lines between columns; set both, e.g. `1px` and `solid` |
| `--gt-table-frame`, `--gt-table-frame-style` | `0px`, unset: `none` | Width and style of the frame around a table |
| `--gt-table-head-line` | unset: `--gt-line-strong` | Colour of the line under header cells |
| `--gt-table-head-size`, `--gt-table-head-leading` | `var(--gt-small-size)`, `var(--gt-small-leading)` | Size and line height of header cells' text |
| `--gt-table-head-weight` | `var(--gt-weight-medium)` | Its weight |
| `--gt-table-head-tracking` | `normal` | Letter spacing of header cells' text |
| `--gt-table-head-min-width` | `auto` | Least width of a header cell: a floor for columns sized by their content (`--gt-table-shared-layout: auto`) |
| `--gt-table-head-color` | unset: `--gt-text-2` | Its colour |
| `--gt-table-head-fill` | unset: `transparent` | Background of header cells |
| `--gt-cell-pad`, `--gt-head-cell-pad` | `9px 12px`, `8px 12px` | Padding of body cells and header cells |
| `--gt-cell-first-pad` | `0px` | Left padding of the first column, which starts with the text column; with row handles the cell keeps at least the room the handle needs |
| `--gt-table-row-height` | `auto` | Least height of a body row |
| `--gt-table-shared-layout` | `fixed` | Columns without a stored width share the text column evenly; `auto` gives them their share by content, as a table without stored widths in HTML. Stored widths stay a column's least width |
| `--gt-inline-code-wrap` | unset: as the text around it | `nowrap` keeps inline code on one line, its spaces kept: a code span that does not fit at the end of a line moves to the next whole (it sets `text-wrap-mode`) |
| `--gt-table-code-size` | `var(--gt-inline-code-size)` (0.87em) | Size of inline code in a cell |
| `--gt-table-code-pad` | `var(--gt-inline-pad)` | Its padding |
| `--gt-table-code-fill` | unset: `--gt-fill-2` | Its plate; `transparent` with `--gt-table-code-pad: 0` drops the plate |
| `--gt-handle-rail` | 56 px (`0px` in `modern`, `minimal`) | Rail a narrow `notion` or `docs` page keeps on the left for the block handle |
| `--gt-handle-offset` | 54 px | Room left of the text the block handle needs; with less, no handle shows |

A rule that removes a default line, such as the one under a table's last row, is as heavy as the
cell rule it overrides, so your own rule on the cells wins over it.

A table with a grid and a filled head:

```css title="editor-theme.css"
.app-editor .gotipe-block-editor {
  --gt-table-col-rule: 1px;
  --gt-table-col-rule-style: solid;
  --gt-table-frame: 1px;
  --gt-table-frame-style: solid;
  --gt-table-head-fill: var(--gt-fill-1);
  --gt-cell-first-pad: 12px;
}
```

To underline insertions instead of the bar:

```css title="editor-theme.css"
.app-editor .gotipe-block-editor {
  --gt-sug-ins-bar: 0px;
  --gt-sug-ins-underline: underline;
  --gt-sug-ins-underline-thickness: 1px;
}
```

### Classes

| Class | What it is |
|---|---|
| `.gotipe-page` | Root of `PageEditor` |
| `.gotipe-page-head` | Page head before the content: the glyph (`.gotipe-page-head-icon`), the title, the byline. In a `.gotipe-page` it stands at the page's top padding, and the content (its first block is the page title) follows it at `--gt-head-gap`; elsewhere the content follows at `--gt-head-after` |
| `.gotipe-review-card` | A proposal's or a comment's card; `.gotipe-review-card-head` its head, whose `b` is the name |
| `.gotipe-review-card-delete` | An icon button at the end of a card's head; red on hover |
| `.gotipe-btn`, `.gotipe-btn-primary`, `.gotipe-btn-secondary` | Buttons of the review bar and the cards: quiet, ink for the answer that applies, and the other answer, which is quiet beside the primary one and a fill when it is the only button in its group (a stale proposal's "Reject") |
| `.gotipe-sug-ins`, `.gotipe-sug-del`, `.gotipe-sug-stale` | A proposed insertion, deletion and stale proposal in the text |
| `.gotipe-sug-block-changed` | A block a proposal changes; draws the bar of `--gt-sug-changed-bar` |
| `.gotipe-sug-live` | The end of a proposal that is still being written (`live`): its last inline insertion, or a span over the last piece of its last new block's text; a last block with no text of its own (an empty line, a code block) carries it itself. Draws the caret of `--gt-sug-live-caret-width` |
| `.gotipe-lane-cursor` | A lane's cursor over the page; `[data-variant="pointer"]` as an arrow, `[data-compact]` with its flag in one line, `[data-glide]` while it follows a growing proposal's text, `[data-chip-side="right"]` or `"left"` for the side its flag has room on (physical sides, not mirrored right to left). Its flag is `.gotipe-lane-chip`, with `.gotipe-lane-chip-name` and `.gotipe-lane-chip-label`; with the pointer, `--gt-lane-pointer-chip-x` and `-y` place it, for a compact one too (on the cursor's own row, say) |
| `.gotipe-review-card[data-live]` | The card of a proposal that is still being written: no answers yet |
| `.gotipe-slash-menu-item-description` | A second, quiet line under a "/" menu row's title, when the host turns descriptions on; one line with an ellipsis |

All tokens come from one source, `design-tokens.json` in the GoTipe repository; the CSS
files and the JS palettes are generated from it.

Text and highlight colours in a document store the colour for a light page, so exports
print them as written. The editor draws a palette colour through its `--gt-tc-*` or
`--gt-bg-*` token, so it follows dark mode and your overrides.

## Limitations

- `setTheme` writes the whole palette as inline custom properties on its root. Overrides
  in a stylesheet on that same element lose to them; put yours on a container inside it.
- Under a Content Security Policy, `style-src` needs `'unsafe-inline'`: menu and cursor
  positions, lane colours and cell alignment are `style` attributes.
- The stylesheets use physical left and right; right-to-left layout is not supported.
- `@gotipe/theme` themes with tokens only. It has no icon-set or component-override API
  (`defineIcons` and `ThemeConfig.componentOverrides` were removed before they did anything);
  to change how a block looks, pass `blockViews` to the editor.

## Related

- [Block editor](/docs/ui/block-editor) · [Page editor](/docs/ui/page-editor) · [Code block](/docs/extensions/code-block)
- [Security](/docs/resources/security) · [Licensing](/docs/resources/licensing)
