# @gotipe/theme

The styles and design tokens of the ready GoTipe editors: the document and UI style sheets,
light and dark palettes as `--gt-*` custom properties, and a small API to switch the theme. It
is used by [`@gotipe/block-editor`](https://www.npmjs.com/package/@gotipe/block-editor).

[Docs](https://gotipe.com/docs/ui/theming/) · [Website](https://gotipe.com) · [Repository](https://github.com/veniameen/gotipe)

## Install

```sh
npm install @gotipe/theme @gotipe/core
```

## Usage

Import the style sheets once, before your own CSS:

```ts
import "@gotipe/theme/base.css";
import "@gotipe/theme/theme.css";
```

| File | Contents |
|---|---|
| `@gotipe/theme/base.css` | The document in every view: text, blocks, lists, tables, code |
| `@gotipe/theme/theme.css` | Menus, panels, review cards and the loading, error and read-only states |
| `@gotipe/theme/tokens.css` | Only the tokens: light and dark palettes and the views |
| `@gotipe/theme/page.css` | `base.css` and `theme.css` in one import, kept for older imports |

Switch light and dark mode, or follow the operating system:

```ts
import { getTheme, onThemeChange, setTheme } from "@gotipe/theme";

const stopFollowing = setTheme("system");
const unsubscribe = onThemeChange((mode, resolved) => console.log(mode, resolved));
console.log(getTheme()); // { mode: "system", resolved: "dark" }
```

Pass your application's colors by overriding tokens on a container around the editor:

```css
.app-editor {
  --gt-page-bg: var(--app-canvas);
  --gt-text: var(--app-text);
  --gt-accent: var(--app-brand);
  --gt-font-ui: var(--app-font);
}
```

- `setTheme(mode, root?)`, `getTheme(root?)`, `onThemeChange(listener, root?)`: the mode
  (`"light"`, `"dark"` or `"system"`) as `data-theme` on `root` (default `<html>`).
- `applyTheme(config, root?)`: writes `config.tokens` as `--gt-*` properties.
- `defineTheme(config)`, `lightTheme`, `darkTheme`: typed `ThemeConfig` palettes.

## License

The GoTipe Commercial License, see
[LICENSE-COMMERCIAL](https://github.com/veniameen/gotipe/blob/main/packages/theme/LICENSE-COMMERCIAL)
and [licensing](https://gotipe.com/docs/resources/licensing/). It is free for personal,
non-profit, educational and open-source projects, for organizations whose gross
revenue was under USD 1,000,000 in the last 12 months, and for evaluation and development; other production use needs a commercial
license per product.
