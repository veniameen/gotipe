---
title: Typography
description: Typography replaces typed quotes, dashes, ellipses, arrows, symbols and fractions with typographic characters, at the caret and never in code.
packages: ["@gotipe/core"]
license: MIT
---

`Typography` adds input rules that replace what you type with the typographic character: `"` becomes “ or ”, `--` becomes —, `...` becomes ….

```ts title="editor.ts"
import { createEditor } from "@gotipe/core";
import { Typography } from "@gotipe/core/extensions";
import { DefaultPreset } from "@gotipe/core/presets";

const editor = await createEditor({
  extensions: [DefaultPreset, Typography.configure({ locale: "ru" })],
});
```

`Typography` is in no preset. Add it after the preset, so the Markdown shortcuts of the blocks are tried first.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `locale` | `"en" \| "ru"` | `"en"` | Style of quotes and of the spaced dash. |
| `quotes` | `boolean` | `true` | Typographic quotes and apostrophes. |
| `dashes` | `boolean` | `true` | Em dash and spaced dash. |
| `ellipsis` | `boolean` | `true` | `...` becomes …. |
| `arrows` | `boolean` | `true` | `->`, `<-` and `=>`. |
| `symbols` | `boolean` | `true` | `(c)`, `(r)` and `(tm)`. |
| `fractions` | `boolean` | `true` | `1/2`, `1/4` and `3/4`. |
| `multiplication` | `boolean` | `true` | `x` between digits. |

## Replacements

| You type | `en` | `ru` |
| --- | --- | --- |
| `"` at the start of a word | “ | « , or „ inside « » |
| `"` after a word | ” | » , or “ to close „ |
| `'` at the start of a word | ‘ | ‘ |
| `'` after a letter or digit | ’ | ’ |
| `--` | — | — |
| A hyphen between two spaces | – | — |
| `...` | … | … |
| `->`, `<-`, `=>` | →, ←, ⇒ | →, ←, ⇒ |
| `(c)`, `(r)`, `(tm)` in either case | ©, ®, ™ | ©, ®, ™ |
| `1/2`, `1/4`, `3/4` as a word, then a space | ½, ¼, ¾ | ½, ¼, ¾ |
| A digit, `x` or Cyrillic `х`, a digit | `2×3` | `2×3` |

A quote opens after a space, an opening bracket, a dash or another opening quote, and at the start of a block; otherwise it closes. `0x1F` keeps its `x`: a lone zero before it is a hexadecimal prefix.

## Where it applies

- Only at the caret: the rule looks at the text before the caret that ends with the character just typed. Text elsewhere in the block, pasted text and text committed by an IME are not changed.
- Never in code: not in inline code, not in a code block or any other raw-text block.
- Not inside an address being typed: a word that starts with `https://`, `www.` or `mailto:`, also right after a quote or a bracket, keeps its `--` and quotes. Only a `"` that closes a quote converted before the address becomes the closing quote: `"https://example.com"` gives “https://example.com”.
- Not when the character was not inserted: when a transaction filter or `CharacterCount`'s limit rejects it, no rule runs on the text that was already there.
- `--` alone at the start of a block is left for the `---` divider shortcut.

## Undo

The typed character is inserted first, and the replacement is its own transaction. One Undo right after a replacement brings back what you typed: `…` becomes `...` again. The new character keeps the marks of the text it replaced.

## Limitations

- The straight quote after a digit becomes a closing quote, so `5'10"` needs an Undo after each quote to stay as typed.
- The rules do not look ahead: `<-` becomes ← before a `>` could make it `<->`.

## Related

- [Extensions](/docs/concepts/extensions#input-rules): how input rules run.
- [Marks](/docs/extensions/marks): the inline Markdown input rules.
