---
title: Math
description: The Math node stores a formula as TeX source; GoTipe shows and edits the source, and you plug in your own renderer to draw it.
packages: ["@gotipe/core", "@gotipe/react"]
license: MIT
---

`math` stores a formula as raw TeX text. GoTipe ships no TeX renderer: the editor shows the source in a monospace block and edits it as text. To draw formulas, give the editor your own view for `math`, and your server-side HTML a renderer for it.

The `Math` extension is in `FullPreset` only. `DefaultPreset` and `PageEditor` do not include it. Its export name shadows the global `Math`, so import it under another name:

```ts title="editor.ts"
import { createEditor } from "@gotipe/core";
import { Math as MathExtension, Paragraph } from "@gotipe/core/extensions";

const editor = await createEditor({ extensions: [Paragraph, MathExtension] });
editor.chain().insertBlockAfter("math", { display: "block" }).run();
```

`Math` has no options.

## Node

The content is the TeX source, a string without marks.

| Attribute | Type | Default | Description |
| --- | --- | --- | --- |
| `display` | `"block" \| "inline"` | `"block"` | How your renderer should typeset the formula. The built-in view ignores it. |

| Command | Description |
| --- | --- |
| `insertBlockAfter("math", { display: "block" })` | Inserts an empty formula after the current block. |
| `setBlockType("math", { display: "block" })` | Turns the current block into a formula; its text becomes the TeX source. |

The "/" menu lists **Math Equation** (it also answers to `math`, `equation`, `latex` and `katex`).

| Key or input | Action |
| --- | --- |
| `$$` as the whole text of a block | Turns the block into a formula (see the note) |
| Shift+Enter | New line in the source |
| Enter | Splits the formula into two math blocks at the caret |
| Tab, Shift+Tab, Escape | With `CodeBlock` installed, the same as in a code block: two spaces in, two spaces out, a paragraph after a top-level formula |

## What the editor shows

The React view draws the block with the label "Formula · TeX" and the source below it, edited like code. The Vue adapter draws the source in a `<pre class="gotipe-math">`. Neither typesets the formula.

## Your own renderer

### React

A block view replaces the built-in view for one block type. It receives the block, the editor and the attributes its root element must carry:

```tsx title="math-view.tsx"
import type { BlockViewProps } from "@gotipe/react";
// Your TeX renderer: (source: string, display: boolean) => HTML string you trust.
import { renderTex } from "./tex";

export function MathView({ block, rootProps }: BlockViewProps) {
  const source = typeof block.content === "string" ? block.content : "";
  return (
    <div
      {...rootProps}
      data-block-type="math"
      className={["my-math", rootProps.className].filter(Boolean).join(" ")}
    >
      <div
        contentEditable={false}
        data-gotipe-widget=""
        dangerouslySetInnerHTML={{ __html: renderTex(source, block.attrs.display !== "inline") }}
      />
      <pre>
        <code data-gotipe-text-content="">
          {source || <br data-gotipe-trailing-break="" />}
          {source.endsWith("\n") && <br data-gotipe-trailing-break="" />}
        </code>
      </pre>
    </div>
  );
}
```

```tsx title="editor.tsx"
import { BlockEditor } from "@gotipe/block-editor";
import { FullPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/react";
import { MathView } from "./math-view";

const blockViews = { math: MathView };

export function DocumentEditor() {
  const editor = useEditor({ extensions: [FullPreset] });
  return <BlockEditor editor={editor} blockViews={blockViews} />;
}
```

The view keeps the source editable and adds the formula above it:

- `rootProps` carries `data-block-id` and decorations; spread it on the root element.
- The preview sits in an element with `contentEditable={false}` and `data-gotipe-widget`, so the editor does not treat its text as document text.
- The source sits in an element marked `data-gotipe-text-content`, so the caret lands there even when the source is empty. The trailing `<br>` elements keep an empty source and a final empty line reachable, as the built-in view does.

`blockViews` works the same way on `Editor` and `EditorContent` from `@gotipe/react` and on `PageEditor`.

> [!WARNING]
> `dangerouslySetInnerHTML` puts your renderer's output into the page as it is. Use a renderer that escapes the TeX it receives, because the source is user text.

### Vue

`EditorContent` from `@gotipe/vue` takes a `blockViews` object of render functions with the props `block`, `editor`, `content`, `children`, `rootProps` and `readOnly`. See [Vue](/docs/frameworks/vue).

### Server-rendered HTML

`renderToHtml` from `@gotipe/core/server` takes `blockRenderers`, one function per block type that returns HTML for that block:

```ts title="render.ts"
import type { Document } from "@gotipe/core";
import { renderToHtml } from "@gotipe/core/server";
import { renderTex } from "./tex";

export function renderDocument(document: Document): Promise<string> {
  return renderToHtml(document, {
    blockRenderers: {
      math: (block) =>
        renderTex(typeof block.content === "string" ? block.content : "", block.attrs.display !== "inline"),
    },
  });
}
```

GoTipe escapes ordinary document text, but the HTML a block renderer returns is your responsibility.

## Export

| Output | A math block becomes |
| --- | --- |
| `getMarkdown()`, `exportToMarkdown`, `renderToMarkdown` | The source as a plain paragraph, without `$$`; it reads back as a paragraph |
| `getHTML()` on the JS engine, `serializeHtml`, `exportToHtml` with options, `renderToHtml` | `<p>` with the escaped source |
| `renderToHtml` with `blockRenderers.math` | Your HTML |
| `getHTML()` on the WASM engine, `gotipe-convert html` | `<pre class="gotipe-raw">` with the escaped source |
| `gotipe-convert markdown` | The source between `$$` lines |
| PDF and DOCX | The source as literal text |
| `getText()` | The source |

> [!NOTE]
> Math is always a block node: there is no inline math mark, and `display: "inline"` is only a hint for your renderer. The `$$` rule keeps the two dollar signs as the start of the TeX source; delete them after the conversion. Markdown has no math in this release: `getMarkdown()` writes the source as plain text, so a round trip through Markdown turns a formula into a paragraph.

## Related

- [Code block](/docs/extensions/code-block): the other raw-text block.
- [React](/docs/frameworks/react): `blockViews` and `BlockViewProps`.
- [Server rendering](/docs/conversion/server): `renderToHtml` and `gotipe-convert`.
- [Security](/docs/resources/security): what GoTipe escapes and what it trusts.
