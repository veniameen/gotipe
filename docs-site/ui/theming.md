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
| `docs` | 680 px | 14/22 px | 28 px | Outline of headings beside the text, line numbers in code, no handle |
| `modern` | 680 px | 15/24 px | 28 px | Less space above the title, no handle |
| `minimal` | 640 px | 14/22 px | 22 px | Tighter spacing and 24 px side padding, no handle |

The editor root is a size container. In a container 640 px wide or less, the side padding,
heading sizes and title shrink and the `docs` outline hides; at 359 px or less they shrink
again. The editor takes its width from its parent: in a layout that sizes by content, give
the parent a width.

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
- `defineIcons` and `ThemeConfig.componentOverrides` are typed, but no component reads
  them yet.

## Related

- [Block editor](/docs/ui/block-editor) · [Page editor](/docs/ui/page-editor) · [Code block](/docs/extensions/code-block)
- [Security](/docs/resources/security) · [Licensing](/docs/resources/licensing)
