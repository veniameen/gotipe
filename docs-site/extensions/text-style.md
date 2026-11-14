---
title: Font and size
description: FontFamily and FontSize mark a selection with one of the theme's faces and a size in pixels; the modern toolbar's font list and size stepper set them.
packages: ["@gotipe/core", "@gotipe/block-editor"]
license: MIT
---

`FontFamily` and `FontSize` are marks of a selection's text. A face is a name the theme maps to its own font token, never an arbitrary CSS font; a size is a whole number of pixels within a bounded range.

```ts title="text-style.ts"
import { createEditor } from "@gotipe/core";
import {
  FontFamily,
  FontSize,
  getFontFamily,
  getFontSize,
  setFontFamily,
  setFontSize,
  unsetFontFamily,
  unsetFontSize,
} from "@gotipe/core/extensions";
import { DefaultPreset } from "@gotipe/core/presets";

const editor = await createEditor({
  extensions: [DefaultPreset, FontFamily, FontSize.configure({ min: 10, max: 48 })],
});
setFontFamily(editor, "serif");
setFontSize(editor, 18);
getFontFamily(editor); // "serif"
getFontSize(editor); // 18
```

Neither extension is in a preset.

## Faces

| Name | Theme token | HTML |
| --- | --- | --- |
| `system` | `--gt-font-ui` | `font-family:system-ui` |
| `serif` | `--gt-font-serif` | `font-family:serif` |
| `mono` | `--gt-font-mono` | `font-family:monospace` |

`FONT_FAMILIES` lists them. The renderers draw the mark as `<span class="gotipe-font" data-font="serif">` and the theme (`text-style.css`) gives it the token's stack, so a host changes a face through `--gt-font-serif` and the document never holds a font name. The system face is the document's own: the toolbar's list removes the mark when you choose it.

## Sizes

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `min` | `number` | `10` | The smallest size commands set. |
| `max` | `number` | `48` | The largest size commands set. |

`setFontSize` rounds to a whole pixel and clamps to the options; both are kept within `FONT_SIZE_LIMITS` (6–96 px). Renderers and HTML apply only a whole size within those limits: another value stays in the document but is not drawn or written.

## Commands

| Function | Description |
| --- | --- |
| `setFontFamily(editor, family)`, `unsetFontFamily(editor)` | Mark or unmark the selection as one undo step. At a caret the mark applies to the text you type next. |
| `setFontSize(editor, size)`, `unsetFontSize(editor)` | The same for the size. |
| `getFontFamily(editor)`, `getFontSize(editor)` | The face or size at the caret, or of the first selected character; `null` without a mark. |

Each `set`/`unset` returns `false` when nothing changes, the value is invalid or the editor is read-only. A new face or size replaces the old one on the same text.

## In the toolbar

[FixedToolbar](/docs/ui/fixed-toolbar) shows these two tools when the editor has both marks. `FontFamilyPicker` and `FontSizeStepper` from `@gotipe/block-editor` are the GoTipe Atlas tools (frame 27) for your own toolbar as well: the current face by name with a list where each face is named in itself, and minus, the size, plus. The size field takes a typed number: Enter or leaving it applies it, the arrow keys step it, Escape returns to the text. Without a mark the field shows the size the theme gives the text at the caret. Where text takes no marks, the editor is read-only or the size is at its limit, the tools stay focusable and their tooltips say why.

```tsx title="toolbar.tsx"
import { AlignPicker, FontFamilyPicker, FontSizeStepper, InvisiblesToggle } from "@gotipe/block-editor";

<div role="toolbar">
  <FontFamilyPicker editor={editor} />
  <FontSizeStepper editor={editor} min={10} max={48} />
  <AlignPicker editor={editor} />
  <InvisiblesToggle editor={editor} />
</div>;
```

## Output

- **HTML** (`getHTML()`, `serializeHtml`, the native export) writes `<span style="font-family:serif">` and `<span style="font-size:18px">`, byte for byte the same in JavaScript and Rust. Reading HTML takes back a single generic face (`system-ui`, `sans-serif`, `serif`, `ui-serif`, `monospace`, `ui-monospace`) and a whole `px` size within the limits; a font list such as `Arial, sans-serif` or a `pt` size is dropped, and so is everything the editor's schema does not declare.
- **Markdown** has no syntax for faces and sizes. Blocks you do not edit keep their source bytes; an edited block is written without these marks, with its text and other marks.
- **PDF** and **DOCX** accept documents with these marks and draw the text in the document's own face and size.

## Related

- [Marks](/docs/extensions/marks): bold, colours and the other inline marks.
- [Text alignment and direction](/docs/extensions/text-align).
