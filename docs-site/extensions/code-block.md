---
title: Code block
description: The CodeBlock node stores raw code and its language; optional syntax highlighting comes from the Shiki adapter in @gotipe/block-editor/shiki.
packages: ["@gotipe/core", "@gotipe/block-editor"]
---

`codeBlock` holds raw text: no marks, line breaks as `"\n"`, every character as typed. The language and the fence's meta string are attributes. Highlighting is separate and optional: it never changes the document and adds no undo steps.

```demo
code
```

The `CodeBlock` extension is in `DefaultPreset`, `FullPreset` and `PageEditor`. It comes from `@gotipe/core` (MIT). The Shiki adapter belongs to `@gotipe/block-editor`, which is commercial.

## Node

| Attribute | Type | Default | Description |
| --- | --- | --- | --- |
| `language` | `string` | `""` | Language id, such as `"typescript"`, or an alias, such as `"ts"`. Empty is plain text, written as a bare fence and a bare `<pre><code>`. |
| `meta` | `string` | — | The rest of the fence's info string, such as `title="a.ts"`. |

```ts title="editor.ts"
import { createEditor } from "@gotipe/core";
import { CodeBlock, Paragraph } from "@gotipe/core/extensions";

const editor = await createEditor({ extensions: [Paragraph, CodeBlock] });
editor.chain().setBlockType("codeBlock", { language: "typescript" }).run();
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `languages` | `string[]` | `javascript`, `typescript`, `python`, `rust`, `go`, `html`, `css`, `json`, `sql`, `bash` | Not read in this release. |
| `defaultLanguage` | `string` | `""` | Not read in this release. |
| `syntaxHighlight` | `boolean` | `true` | Not read in this release. Highlighting is on when you pass a highlighter. |

## Commands

| Command | Description |
| --- | --- |
| `setBlockType("codeBlock", { language })` | Turns the current block into a code block; its text becomes the code. |
| `setBlockAttrs(blockId, { language })` | Changes the language. |

The "/" menu lists it as **Code Block**.

## Keyboard and input rules

| Key or input | Action |
| --- | --- |
| ```` ``` ```` and a space in an empty block | Code block; ```` ```ts ```` and a space sets the language |
| Enter | Line break |
| Tab | Inserts two spaces (replacing a selection) |
| Shift+Tab | Removes up to two spaces at the start of the current line, when the caret is after them |
| Escape | Adds an empty paragraph after the code block and moves the caret there |

## In the editor UI

The block has a header with a language menu (Plain text, JavaScript, TypeScript, Python, Rust, Go, HTML, CSS, JSON, SQL, Bash, Java, C, C++, Ruby, PHP, Swift, Kotlin, YAML, Markdown) and a copy button. Code with more than one line shows line numbers. A language that is not in the menu, such as `ts` from a Markdown fence, is shown as it is. Plain text stands for an empty language and for `plain` or `plaintext` in older documents; choosing it writes an empty language.

## Syntax highlighting with Shiki

Install Shiki next to the editor UI (the peer range is `^1.22.0`):

```sh
npm install shiki
```

Create a highlighter once, outside your components, and pass it to `BlockEditor` or `PageEditor` as `highlight`:

```tsx title="code-editor.tsx"
import { BlockEditor } from "@gotipe/block-editor";
import {
  codeLanguageAliases,
  codeLanguages,
  createShikiHighlighter,
  gotipeCodeThemeLoader,
} from "@gotipe/block-editor/shiki";
import { FullPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/react";
import "@gotipe/theme/base.css";
import "@gotipe/theme/theme.css";

const highlight = createShikiHighlighter({
  langs: codeLanguages,
  aliases: codeLanguageAliases,
  themes: { light: gotipeCodeThemeLoader, dark: gotipeCodeThemeLoader },
});

export function CodeEditor() {
  const editor = useEditor({ extensions: [FullPreset] });
  return <BlockEditor editor={editor} highlight={highlight} />;
}
```

`createShikiHighlighter` uses `shiki/core` with the JavaScript regex engine: no WebAssembly and no `eval`, so it runs under `script-src 'self'`. Nothing loads until the first code block needs a language; each grammar is a lazy chunk your bundler emits, and your server must serve those chunks under your CSP. A grammar that fails to load is retried on a later request.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `langs` | `Record<string, () => Promise<unknown>>` | — | Grammars by language id, as lazy imports, such as `{ typescript: () => import("shiki/langs/typescript.mjs") }`. |
| `themes` | `{ light: () => Promise<unknown>; dark: () => Promise<unknown> }` | — | Light and dark themes, as lazy imports. |
| `aliases` | `Record<string, string>` | — | Extra names for languages, such as `{ ts: "typescript" }`. |

`@gotipe/block-editor/shiki` also exports ready values:

| Export | Description |
| --- | --- |
| `codeLanguages` | Lazy grammars for the 19 languages of the language menu. |
| `codeLanguageAliases` | `ts`, `tsx`, `js`, `jsx`, `py`, `rs`, `sh`, `shell`, `yml` and `md`. |
| `gotipeCodeTheme` | A Shiki theme drawn with the theme's `--gt-syn-*` tokens, so one theme serves light and dark. |
| `gotipeCodeThemeLoader` | The same theme in the loader form `themes` expects. |

To use Shiki's own themes, pass loaders such as `() => import("shiki/themes/github-light.mjs")` and `() => import("shiki/themes/github-dark.mjs")`.

Highlighting runs 120 ms after the code stops changing. Code with the language `plain`, `plaintext` or no language is never highlighted. A failed, late or mismatching result leaves the raw code visible.

## Your own highlighter

A highlighter is a function with the `CodeHighlighter` type: it receives the code and the language and resolves to lines of tokens, or `null` for a language it does not know.

```ts title="highlighter.ts"
import type { CodeHighlighter } from "@gotipe/block-editor";

/** Colours `//` comments in JavaScript and leaves everything else plain. */
export const commentHighlighter: CodeHighlighter = async (code, language) => {
  if (language !== "javascript") return null;
  return code.split("\n").map((line) => {
    const at = line.indexOf("//");
    if (at === -1) return [{ content: line }];
    return [
      { content: line.slice(0, at) },
      { content: line.slice(at), color: "var(--gt-syn-comment)", fontStyle: 1 },
    ];
  });
};
```

| Token field | Type | Description |
| --- | --- | --- |
| `content` | `string` | Text of the token. |
| `color` | `string` | Colour in the light theme. |
| `darkColor` | `string` | Colour in the dark theme. |
| `fontStyle` | `number` | Bit flags: 1 italic, 2 bold, 4 underline. |

Joining each line's `content` and then the lines with `"\n"` must reproduce the code exactly, or the result is ignored. Colours must be plain CSS colours or a `var(--gt-syn-*)` token; anything else is dropped. Tokens render as text, never as HTML.

For your own block views, `@gotipe/block-editor` exports `CodeBlockView` (the code block with a `highlight` prop), the `useHighlightedCode(highlight, code, language)` hook and `HighlightedLines`.

## Markdown

A code block is written as fenced code. The info string is the language followed by `meta`:

````md
```ts title="a.ts"
const a = 1;
```
````

The fence uses backticks, or tildes when the info string contains a backtick, and is longer than any run of its character in the code. Tilde fences and indented code are read as code blocks; indented code gets an empty language and is written fenced once edited.

> [!NOTE]
> The `CodeBlock` options are accepted but not read. The ```` ``` ```` rule stores the language `plain`, the language menu writes `plaintext` and the "/" command sets none; all three mean plain text, but each is written to Markdown as it is (```` ```plain ````, ```` ```plaintext ````, ```` ``` ````). Escape adds a paragraph only after a top-level code block, not after one inside a toggle or a column. `meta` is kept for Markdown; the UI neither shows nor edits it.

## Related

- [Block editor](/docs/ui/block-editor): the `highlight` prop and the rest of the UI.
- [Theming](/docs/ui/theming): the `--gt-syn-*` tokens and dark mode.
- [Security](/docs/resources/security): CSP for the editor and its lazy chunks.
- [Markdown](/docs/conversion/markdown): fences, info strings and raw blocks.
