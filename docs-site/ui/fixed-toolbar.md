---
title: Fixed toolbar
description: FixedToolbar is the toolbar over the document of the modern view, with history, block type, font and size, marks, alignment, lists, Insert and More when the bar is narrow.
packages: ["@gotipe/block-editor", "@gotipe/theme"]
license: Commercial
---

`FixedToolbar` is the toolbar a form or a CMS field puts over its document: the bar the
`modern` view is drawn for. It holds undo and redo, the block type, the font and size, bold
to text colour, alignment and lists, Insert and the ¶ switch. A tool that is on stands on a
fill. A tool that can't act now keeps its place, and its tooltip says why. When the bar is too
narrow, the tools that do not fit move to More, a second bar under its button.

> [!IMPORTANT]
> `@gotipe/block-editor` and `@gotipe/theme` are under the GoTipe Commercial License. See
> [licensing](/docs/resources/licensing).

## Example

```tsx title="DescriptionField.tsx"
import { BlockEditor, FixedToolbar } from "@gotipe/block-editor";
import {
  FontFamily,
  FontSize,
  InvisibleCharacters,
  TextAlign,
} from "@gotipe/core/extensions";
import { DefaultPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/react";

export function DescriptionField() {
  const editor = useEditor({
    extensions: [DefaultPreset, TextAlign, FontFamily, FontSize, InvisibleCharacters],
    content: "<p>Describe the release.</p>",
  });

  return (
    <div className="description-field">
      {editor && <FixedToolbar editor={editor} />}
      <BlockEditor editor={editor} view="modern" showAiCommandBar={false} />
    </div>
  );
}
```

The bar is sticky: it stays at the top of the element that scrolls the document. Put it
before the editor in that element.

## Props

| Option | Type | Default | Description |
|---|---|---|---|
| `editor` | `GoTipeEditor` | — | The editor the tools act on. |
| `hide` | `FixedToolbarTool[]` | `[]` | Tools to leave out: `"history"`, `"blockType"`, `"font"`, `"marks"`, `"align"`, `"lists"`, `"insert"`, `"invisibles"`. `"lists"` covers the task list too. |
| `label` | `string` | Formatting, in the editor's language | The toolbar's accessible name. |
| `children` | `ReactNode` | — | Your own tools at the end of the bar, after ¶: a theme switch, a save state. They never move to More. |
| `className` | `string` | — | Added to the root, `.gotipe-fixed-toolbar`. |

## Tools

| Tool | Needs | What it does |
|---|---|---|
| Undo, redo | `History` | One step back or forward. |
| Block type | — | Text, Heading 1–3, Quote and Code. The list buttons show the list, so the name stays the text's. |
| Font and size | `FontFamily` and `FontSize` | `FontFamilyPicker` and `FontSizeStepper`; see [font and size](/docs/extensions/text-style). Shown only when the editor has both marks. |
| Marks | The marks of the presets | Bold, italic, underline, strikethrough, inline code, link and text colour. |
| Alignment | `Paragraph` and `Heading` | `AlignPicker`; `TextAlign` adds its keys. See [alignment](/docs/extensions/text-align). |
| Lists | The lists of the presets | Bulleted, numbered and task list. |
| Insert | The block extensions | The blocks and media of the `/` menu: quote, callout, toggle, code, table, divider, image, file, then your extensions' insert and upload commands. |
| ¶ | `InvisibleCharacters` | `InvisiblesToggle`; see [editing aids](/docs/extensions/editing-aids). Shown only with the extension. |

Insert adds the block after the caret's block as one undo step and puts the caret in its
text, when it has text. On an empty line it does what the `/` menu does there: a quote or a
code block takes the line.

## Narrow bars

When the bar does not fit, whole groups move to More, the least needed first: ¶, the font
and size, Insert, the alignment with the task list, the other marks (strikethrough, code,
link, colour), the lists. Undo and redo, the block type, bold, italic and underline always
stay. More keeps the bar's order, a row of groups per line, and opens under its button.

The bar measures its own width and its tools, not the window, so it fits a side panel as well
as a page, and a longer font name moves a group when it must. If even the tools that always
stay do not fit, the bar scrolls sideways.

## Unavailable tools

A tool that can't act now is `aria-disabled`: it keeps its place and its focus, and its
tooltip, which is also its accessible description, says why:

- nothing to undo or to redo;
- the editor is read-only; ¶ still works, it does not change the document;
- the caret is in code or another block whose text takes no formatting;
- the block is not a paragraph or a heading, so it takes no alignment;
- the size is already the smallest or the largest;
- the caret is in a table cell, which stays text.

## Keyboard

The toolbar is one Tab stop. ← and → move between the tools, Home and End go to the first
and the last one; the size field keeps the arrows while its caret is inside the number. ↓
opens a tool's list or More; Escape closes it and returns to its button, Escape on the bar
returns to the text. Pressing a tool with the pointer keeps the text's selection. Mod+K
over selected text opens the Link field when no formatting bubble is shown (with
`BlockEditor`'s bubble, the bubble's field opens). See [keyboard](/docs/ui/keyboard).

## Styling

`@gotipe/theme` draws the bar in `toolbar.css`, part of `theme.css`: sticky at the top with
`--gt-z-toolbar`, on `--gt-page-bg` with a hairline under it, tools of `--gt-tool` with
`--gt-toolbar-gap` between them and `--gt-fixed-toolbar-pad` around them. More is the overlay
surface with `--gt-toolbar-row-gap` between its rows. The classes are
`.gotipe-fixed-toolbar`, `-track`, `-unit` (with `data-gotipe-unit`), `-sep`, `-more`,
`-panel` and `-row`; see [theming](/docs/ui/theming).

## Limitations

- React only: the [Vue](/docs/frameworks/vue) block editor has no fixed toolbar.
- Insert lists the `/` commands that add a block. A command of your extension that turns the
  current block into another one is not listed.
- Mod+K opens nothing while Link is in a closed More, and nothing at a caret alone.

## Related

- [Block editor](/docs/ui/block-editor): the editor under the bar and its views.
- [Font and size](/docs/extensions/text-style), [alignment](/docs/extensions/text-align),
  [editing aids](/docs/extensions/editing-aids): the extensions behind the tools.
