---
title: Links and paste
description: Autolink links addresses as you type, LinkOnPaste links a pasted address, and MarkdownPaste turns pasted Markdown into blocks.
packages: ["@gotipe/core", "@gotipe/markdown"]
license: MIT
---

Three extensions that act on typed or pasted text. None is in a preset; add the ones you want after it.

```ts title="editor.ts"
import { createEditor } from "@gotipe/core";
import { Autolink, LinkOnPaste, MarkdownPaste } from "@gotipe/core/extensions";
import { DefaultPreset } from "@gotipe/core/presets";

const editor = await createEditor({
  extensions: [DefaultPreset, Autolink, LinkOnPaste, MarkdownPaste],
});
```

| Extension | Name | Acts on |
| --- | --- | --- |
| `Autolink` | `autolink` | An address typed and followed by a space, a line break or Enter |
| `LinkOnPaste` | `linkOnPaste` | Clipboard text that is one address |
| `MarkdownPaste` | `markdownPaste` | Plain clipboard text that is clearly Markdown |

`Autolink` and `LinkOnPaste` need the `Link` extension, which `DefaultPreset` has. Without it the address stays plain text.

## Addresses

Both link extensions accept the same addresses, and nothing else:

| Written as | Link opens |
| --- | --- |
| `https://example.com/path`, `http://…` | The address. The host needs a dot, or is `localhost` or an IP address. |
| `www.example.com` | `https://www.example.com`, or `http://` with `defaultProtocol: "http"`. |
| `mailto:name@example.com` | The address. |

`linkHref(text, protocol?)` from `@gotipe/core/extensions` is the check itself: it returns the address to open, or `null`. Every address it accepts also passes `toSafeHref`, the check the renderers and the HTML output apply.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `defaultProtocol` | `"https" \| "http"` | `"https"` | Protocol of an address written as `www.…`. Both extensions have it. |

## Autolink

Type an address and then a space, Shift+Enter or Enter: the address gets the `link` mark with the defaults of `Link`.

- Punctuation around the address is not linked: `(www.example.com).` links `www.example.com`. A closing bracket stays in the link when the address opened it.
- The link is its own transaction after the typed space. Undo removes the link and keeps the text.
- On Enter the link is added first and the block is split after it, as two undo steps.
- Text that is already a link, inline code and atomic elements are left alone. Raw-text blocks have no input rules at all.

## Link on paste

When the clipboard text is a single address (spaces around it are ignored):

- With text selected, the selection becomes a link to the address. The text is kept. A selection across blocks is linked in each block.
- With a collapsed caret, the address is inserted as a link.
- In a code block, in inline code, or when the address is not accepted, the text is pasted as ordinary text.

The paste is one undo step. `LinkOnPaste` is a [paste rule](/docs/concepts/extensions#paste-rules), so it takes the clipboard's plain text even when the clipboard also holds HTML.

## Markdown paste

`MarkdownPaste` parses plain clipboard text with `@gotipe/markdown` and inserts blocks instead of one paragraph per line: headings, lists, task lists, quotes, alerts, tables, code, images and inline marks.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `maxLength` | `number` | `1000000` | Longer text is pasted as paragraphs without parsing. |
| `customEmoji` | `Record<string, string>` | — | Registered custom emoji, name to image address, for `:name:`. |

The text is parsed only when it is clearly Markdown. Code is never: when a line outside code fences looks like source code, the whole text is pasted as it is. Such a line is indented by four spaces or a tab (list items may be indented), ends with `;`, `{` or `}`, declares something (`const x =`, `def name(`, `class Name:`, `import`, `return`) or is a shell command (`npm i`, `git`, `cd`). Otherwise one of these is enough:

- a code fence that is closed;
- a table: a row with `|` followed by its delimiter row;
- a link or image to a safe address: `https://`, `http://`, `mailto:`, `/`, `./`, `../` or `#`, as in `[text](https://example.com)`. A bracket glued to a name (`handlers[name](event)`) or another target (`note [1](2)`) is no link. With `Mention`, `[@Anna](mention:user-42)` counts too;
- a task item, `- [ ] text`;
- two list items in a row, bulleted or numbered;
- two quoted lines in a row;
- two headings (`#` to `######`), each followed by an empty line or the end of the text.

A single heading, prose with a single `-` line, `# install` followed by `npm i --save-dev __tests__`, or `# Compute totals` followed by Python is pasted as text: underscores, brackets and indents stay. `looksLikeMarkdown(text, { mentions })` is the detector itself.

What else decides the result:

- Content copied from a GoTipe editor and clipboard HTML keep their priority, as before. Markdown is detected only when the clipboard has plain text alone.
- In a code block or another raw-text block the text is inserted as it is.
- In a table cell, inline Markdown is applied; text with block structure is pasted as lines of text, because a cell holds no blocks.
- The paste is one transaction and one undo step. Text before and after the caret stays around the pasted blocks.
- Inline atoms are read when the editor's schema has their marks: `[@Anna](mention:user-42)` with `Mention`, `$x^2$` with `InlineMath`, an image inside a line with `InlineImage`, and `:name:` with `CustomEmoji` and the `customEmoji` option. Without the mark the text stays as it was pasted.
- Nothing is dropped silently. A top-level block that the editor's schema cannot hold (a table without `Table`, a link without `Link`, raw HTML, front matter) or that has an unsafe address (a link, an image, a file) is pasted as its Markdown source: a raw Markdown block when the schema has `markdownRaw`, otherwise paragraphs of the source lines.
- Addresses pass the editor's own checks, the ones the renderers and the HTML output apply: `javascript:` and other executable schemes never become a link or an image.

## Limitations

- `Autolink` does not link bare domains (`example.com`) or bare mail addresses.
- An address typed with `--` or quotes inside is not changed by `Typography`, but only while it starts with `https://`, `http://`, `www.` or `mailto:`. A `"` that closes a quote opened before the address still becomes the closing quote.
- `MarkdownPaste` does not upload: an image keeps the address written in the Markdown.

## Related

- [Marks](/docs/extensions/marks#links): the `link` mark.
- [Markdown](/docs/conversion/markdown): what the codec reads and writes.
- [Extensions](/docs/concepts/extensions#pasted-text): the `parsePastedText` hook.
