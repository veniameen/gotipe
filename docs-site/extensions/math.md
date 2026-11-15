---
title: Math
description: The Math node stores a formula as TeX source; GoTipe draws it with its own TeX → MathML converter and edits the source, or you plug in your own renderer.
packages: ["@gotipe/core", "@gotipe/react"]
license: MIT
---

`math` stores a formula as raw TeX text. The block editor draws it with GoTipe's own TeX → MathML converter (`@gotipe/core/math`) and shows the source for editing while the caret is in the block; without a TeX reader the React view shows the source only. To draw formulas another way, give the editor your own view for `math`, and your server-side HTML a renderer for it.

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
| `$$` as the whole text of a block | Turns the block into an empty formula, with the caret in its source |
| Enter, Shift+Enter | New line in the source, as in a code block |
| Escape | Adds an empty paragraph after a top-level formula and moves the caret there |
| Tab, Shift+Tab | With `CodeBlock` installed, the same as in a code block: two spaces in, two spaces out |

## What the editor shows

With a TeX reader — `BlockEditor` and `PageEditor` give one, with `EditorContent` pass `parseTex` through `MathRendererContext` ([Inline atoms](/docs/extensions/inline-atoms#how-atoms-look)) — the React view draws the block with the label "Formula · TeX" and the typeset formula, centred, in the document's font (GoTipe Atlas, frames 18 and 24). With the caret in the block the source shows, edited like code, with the drawing under it; TeX that cannot be read shows the source and the reason. At rest the source stays in place, transparent over the drawing, so a click or the arrow keys still reach it. The Vue adapter draws the source in a `<pre class="gotipe-math">`.

## Rendering formulas

`@gotipe/core/math` is an optional entry, outside the core bundle and free of frameworks:

```ts title="formula.ts"
import { mathToDOM, mathToString, parseTex } from "@gotipe/core/math";

const result = parseTex("p = \\frac{L}{N}", { display: true });
if (result.ok) {
  element.append(mathToDOM(result.math, document)); // MathML elements
  const html = mathToString(result.math); // escaped markup for server HTML
} else {
  console.log(result.error.code, result.error.detail, result.error.from, result.error.to);
}
```

It covers a practical subset: digits, Latin and Greek letters (`\alpha`…`\omega`, `\Gamma`…`\Omega`), operators and relations (`\cdot \times \le \ge \ne \approx \equiv \in \to \infty`…), `\frac` (`\dfrac`, `\tfrac`), `^` and `_` with groups, primes, `\sqrt` and `\sqrt[n]`, `\sum \prod \int \lim` and function names (`\sin`, `\log`, `\max`…) with limits under and over them in display mode and beside them in a line, `\left`/`\middle`/`\right` with `( ) [ ] \{ \} | \| \langle \rangle .`, `\text`, font commands (`\mathbf`, `\mathbb`, `\mathcal`, `\mathrm`, `\operatorname`…), accents (`\hat \bar \vec \tilde \dot \overline \underline`…) and spaces (`\, \; \quad`…).

The result is built from an allowed set of MathML elements and attributes; text from the source only ever becomes text, and no attribute value comes from it. Anything else is an error, never raw output:

| `error.code` | Example |
| --- | --- |
| `unclosedGroup` | `\frac{L}{N` (`detail`: `}`) |
| `unexpectedClose` | `a}` |
| `unknownCommand` | `\href{…}`, `\color`, `\begin` |
| `missingArgument` | `\frac{a}` |
| `unmatchedLeft`, `unmatchedRight`, `badDelimiter` | `\left( a`, `a \right)`, `\left< a \right>` |
| `doubleScript` | `x^2^3` |
| `tooLong`, `tooDeep` | more than 2000 characters, more than 64 nested groups |

`%` starts a TeX comment; write `\%` for a percent sign. Not supported: environments and matrices (`\begin…\end`), `\binom`, `\big` sizes, `\color`, `\not`, `\overset`, line breaks.

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
| `getMarkdown()`, `exportToMarkdown`, `renderToMarkdown`, `gotipe-convert markdown` | The source between `$$` lines (a ```` ```math ```` fence when the source has a `$$` line); it reads back as the same formula |
| `getHTML()` on both engines, `serializeHtml`, `exportToHtml`, `renderToHtml`, `gotipe-convert html` | `<p>` with the escaped source |
| `renderToHtml` with `blockRenderers.math` | Your HTML |
| PDF and DOCX | The source as literal text |
| `getText()` | The source |

> [!NOTE]
> Math is always a block node; a formula inside a line is the `InlineMath` atom ([Inline atoms](/docs/extensions/inline-atoms)), and `display: "inline"` is only a hint for your renderer. Enter starts a new line in the source, as Shift+Enter does; Escape leaves the formula. `getMarkdown()` writes a formula as a `$$` block, which GitHub and most Markdown renderers show as math, and `parseMarkdown` reads `$$` blocks and ```` ```math ```` fences back as formulas with the source unchanged.

## Related

- [Code block](/docs/extensions/code-block): the other raw-text block.
- [React](/docs/frameworks/react): `blockViews` and `BlockViewProps`.
- [Server rendering](/docs/conversion/server): `renderToHtml` and `gotipe-convert`.
- [Security](/docs/resources/security): what GoTipe escapes and what it trusts.
