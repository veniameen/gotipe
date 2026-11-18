# One theme and several editors

The view is drawn in the [GoTipe Atlas](../../design/atlas/README.md); this page describes how the theme is built
in code. Token values come from accepted frames: literals live only in
`design-tokens.json`, and components use `--gt-*`. The Atlas decisions in words are
in the [design system](../18-design-system.md).

`design-tokens.json` owns the shared semantic tokens and the light/dark values.
`pnpm generate:theme` updates the CSS; `pnpm check:theme` verifies that it matches.
JS presets use the same JSON. Do not copy color values into examples.

JSON sections:
- `shared`: values that do not depend on the theme, and aliases. An alias that leads to
  the palette is redeclared by the generator in each theme, otherwise `var()` stays on the old one,
  and once more on the editor root (`[data-gt-view]`), so a host's palette on a container reaches it;
- `light`, `dark`: palettes → `tokens/palette.css`;
- `view`: the notion view, the base for all views (`:root` and `[data-gt-view]`); `views`: what
  distinguishes docs, modern, and minimal; `narrow`: tokens for a narrow container (`@container`
  640 and 359 px) for children of the editor root → `tokens/views.css`. A step's `tokens` and
  `views` are sizes, switched off by `data-gt-narrow="off"` on the editor root or an ancestor; its
  `layout` (what shows and how it wraps) always applies. A step redeclares only the `view` aliases
  that lead to what it changes.

`tokens.css` only imports both files. The old names (`--gt-text-prose`,
`--gt-editor-padding-x`, and others) remain aliases of the new ones; new CSS is written with the new ones.

`setTheme(mode, root?)` applies the theme to a specific DOM root. Without a root it works
with documentElement. `getTheme(root?)` and `onThemeChange(listener, root?)` refer
to the same root; separate instances do not change each other's state or subscriptions.
`setTheme` returns a cleanup for the system media listener, to be called on unmount. The cleanup
of an old call does not cancel the listener of a new call. Explicit light/dark turn off
following the system. Import and getTheme are safe during SSR.

## View and host

A view (`minimal`, `modern`, `notion`, `docs`) is a set of `--gt-*` over a single markup. It is
set by the `data-gt-view` attribute on the editor root: `<BlockEditor view="docs">` sets it
itself, `notion` by default. The `.gotipe-block-editor` and `.gotipe-editor` roots are size
containers: a narrow container changes tokens, not markup. The editor takes its width from its parent;
in a context where width is computed from content, set it explicitly.

`base.css` draws the document for all views, `theme.css` draws menus, panels, and states. PageEditor is
the same BlockEditor with a Markdown session and model suggestions; it has no theme of its own and takes
`view` (`notion` by default). `page.css` is kept for compatibility and loads the same
`base.css` and `theme.css`.

There is no separate theme for a host application. The host passes its colors by overriding
`--gt-*` on the editor container or through `applyTheme(config, root)`; host data goes
through contracts, not through the view. The palette is declared only on `:root` and on elements with
`data-theme`, so the host's colors, fonts, and radii are inherited down to text and menus. View
sizes (`[data-gt-view]`) are overridden on the editor root itself.

The editor allows its own container with `data-theme`: its menus and cards, which are rendered outside
the page, receive the container's tokens. Both editors import `base.css` and
`theme.css`.
