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

A token defined from other tokens, such as `--gt-comment-soft` (from `--gt-comment-tint`),
`--gt-ai-ghost` (from `--gt-text-3`) or `--gt-check-fill` (from `--gt-ink`), is resolved again on
the editor root (`[data-gt-view]`), so it follows the base colours you set on a container. To set
such a token itself, set it on the editor root, like a size.

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

These tokens style one part each. A size (`-size`, `-width`, `-bar`, `-offset`, `-thickness`) is
set on the editor root; a colour on any container.

| Token | Default | Controls |
|---|---|---|
| `--gt-check-fill` | `var(--gt-ink)` | Fill of a checked task box |
| `--gt-check-line` | `var(--gt-line-control)` | Border of an empty task box |
| `--gt-check-mark` | an SVG in `--gt-ink-text` | The tick of a checked task box, a `url()` image; with a light `--gt-check-fill`, give it a tick of a dark colour |
| `--gt-comment-soft` | `var(--gt-comment-tint)` | Background of commented text |
| `--gt-ai-ghost` | `var(--gt-text-3)` | Colour of the model's text offered at the caret |
| `--gt-card-name-size` | `var(--gt-ui-size)` (13 px) | Name of the author or lane in a review card's head |
| `--gt-card-name-weight` | `var(--gt-weight-medium)` | Its weight |
| `--gt-card-button-size` | `var(--gt-ui-size)` (13 px) | Text of a review card's buttons |
| `--gt-sug-ins-bar` | `var(--gt-rule)` (2 px) | Bar in the lane's colour along the bottom of a proposed insertion's tint; `0px` removes it |
| `--gt-sug-ins-underline` | `none` | `underline` draws a text underline under a proposed insertion, in the lane's colour |
| `--gt-sug-ins-underline-style` | `solid` | Its style: `solid`, `dotted`, `dashed`, `wavy` |
| `--gt-sug-ins-underline-thickness` | `var(--gt-rule)` (2 px) | Its thickness |
| `--gt-sug-ins-underline-offset` | `var(--gt-underline-offset)` (0.2em) | Its offset from the font's underline position |
| `--gt-sug-changed-bar-width` | `var(--gt-rule)` (2 px) | Bar at the left edge of a block a proposal changes; `0px` removes it |
| `--gt-sug-changed-bar` | unset: the lane's colour | Colour of that bar |
| `--gt-image-radius` | `var(--gt-radius-block)` (8 px) | Corners of an image |
| `--gt-image-ring` | `0px` | Width of a ring around an image, which keeps a light image apart from the page |
| `--gt-image-ring-color` | `var(--gt-line)` | Its colour |
| `--gt-caption-color` | `var(--gt-text-2)` | Colour of an image's caption |
| `--gt-caption-size`, `--gt-caption-leading` | `var(--gt-small-size)`, `var(--gt-small-leading)` | Its size and line height; `--gt-caption-gap` is the space above it |
| `--gt-image-empty-bg` | `var(--gt-sunken)` | Background of an empty image or file block (upload or link) |
| `--gt-handle-rail` | 56 px (`0px` in `modern`, `minimal`) | Rail a narrow `notion` or `docs` page keeps on the left for the block handle |
| `--gt-handle-offset` | 54 px | Room left of the text the block handle needs; with less, no handle shows |

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
