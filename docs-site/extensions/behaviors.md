---
title: Behaviours
description: History, Placeholder, SlashCommands and DragAndDrop, the extensions that add editing behaviour instead of document nodes.
packages: ["@gotipe/core", "@gotipe/block-editor"]
---

These four extensions add no nodes or marks, so installing or removing them never changes which documents the editor accepts.

| Extension | Name | Presets | Adds |
| --- | --- | --- | --- |
| `History` | `history` | Minimal, Default, Full | Undo and redo shortcuts |
| `Placeholder` | `placeholder` | Default, Full | A placeholder decoration for an empty document |
| `SlashCommands` | `slashCommands` | Default, Full | The "/" trigger |
| `DragAndDrop` | `dragAndDrop` | Default, Full | Nothing; see [Drag and drop](/docs/extensions/behaviors#drag-and-drop) |

`PageEditor` includes `History` only. `Mod` below is Cmd on macOS and Ctrl elsewhere.

## History

The editor keeps an undo stack whether or not `History` is installed; `editor.undo()` and `editor.redo()` always work. The extension binds the keys:

| Key | Action |
| --- | --- |
| `Mod+Z` | Undo |
| `Mod+Shift+Z` | Redo |
| `Mod+Y` | Redo |

`History` has no options. How the stack behaves:

- Every committed transaction is one step, and a command chain is one transaction. Typed input is not merged: each input event is its own step.
- The stack keeps the last 100 steps. A new change clears the redo stack.
- Undo and redo restore the selection along with the document.
- `setContent(content)` resets the history; `setContent(content, { addToHistory: true })` records the replacement as one step instead.
- With collaboration on, undo and redo revert your own changes and keep other people's.

```ts title="undo-button.ts"
const undoButton = document.querySelector<HTMLButtonElement>("#undo")!;
undoButton.addEventListener("click", () => editor.undo());
editor.on("viewStateChange", (state) => {
  undoButton.disabled = !state.toolbar.canUndo;
});
```

## Placeholder

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `text` | `string` | `""` | Words of the placeholder. Empty leaves them to the renderer. |

While the whole document is one empty paragraph, `Placeholder` adds a decoration `{ type: "placeholder", text, blockId }` to that paragraph. A custom renderer reads it from `block.decorations` in `editor.getViewState()`. The presets include `Placeholder` without a text, so the extension itself never puts words of one language on screen.

The React and Vue views draw the decoration as `data-placeholder` on the paragraph, while the editor is editable. Which words are shown:

1. The answer of the `placeholder` function you pass to the renderer.
2. The extension's `text`, when you configured one.
3. In React, the placeholder of that block in the interface language (`placeholder.*` strings, see [Localization](/docs/ui/i18n)). `@gotipe/vue` has no strings of its own and shows nothing.

Without the extension the React views still show their localized placeholders on the empty paragraph under the caret and on other empty blocks such as headings and list items. `Placeholder` adds the empty document's paragraph when the caret is elsewhere. `PageEditor` does not include `Placeholder`.

With `Editor` or `EditorContent` from `@gotipe/react`, the `placeholder` function receives the empty block and its parent's type, and returns the text, or `null` for none:

```tsx title="editor.tsx"
import { FullPreset } from "@gotipe/core/presets";
import { EditorContent, type PlaceholderFn, useEditor } from "@gotipe/react";

const placeholder: PlaceholderFn = (block) =>
  block.type === "paragraph" ? "Write something, or press / for blocks" : null;

export function Notes() {
  const editor = useEditor({ extensions: [FullPreset] });
  return <EditorContent editor={editor} placeholder={placeholder} />;
}
```

To change the built-in texts instead, override the UI strings; see [Localization](/docs/ui/i18n).

## Slash commands

`BlockEditor` and `PageEditor` show the "/" menu. Typing "/" at the start of a block or after a space opens it at the caret; the text typed after "/" filters the commands by name and aliases. Arrow keys, Home and End move through the list, Enter runs the selected command and Escape closes the menu. Running a command first removes the "/" and the typed filter.

> [!NOTE]
> In this release the editor emits `openSlashMenu` for a "/" typed at the start of a block or after a space whether or not `SlashCommands` is installed. The extension only adds the same trigger for a block whose whole text is "/", so removing it does not turn the menu off. To hide the menu, pass `showSlashMenu={false}` to `BlockEditor`.

### Register a command

Add `slashCommands` to any extension. `editor.getSlashCommands()` returns the commands of all extensions in order, and `BlockEditor` shows them by default:

```ts title="insert-date.ts"
import { createEditor, defineExtension } from "@gotipe/core";
import { DefaultPreset } from "@gotipe/core/presets";

const InsertDate = defineExtension({
  name: "insertDate",
  slashCommands: [
    {
      name: "Today's date",
      aliases: ["date", "today"],
      icon: "calendar",
      group: "insert",
      execute: (editor) => {
        editor.chain().insertText(new Date().toLocaleDateString()).run();
      },
    },
  ],
});

const editor = await createEditor({ extensions: [DefaultPreset, InsertDate] });
```

| Field | Type | Description |
| --- | --- | --- |
| `name` | `string` | Label of the row; searched. |
| `aliases` | `string[]` | Extra words to search. |
| `description` | `string` | Optional; the built-in menu does not show it. |
| `icon` | `string` | Icon name (below). Any other name shows the first letter of `name`. |
| `group` | `"ai" \| "style" \| "insert" \| "upload"` or your own id | Section of the menu. |
| `execute` | `(editor) => void` | Runs the command. Commands of the `upload` group run before the "/" text is removed. |
| `shouldShow` | `(editor) => boolean` | Hides the command while it returns `false`. |

Built-in icon names: `type`, `heading-1`, `heading-2`, `heading-3`, `list`, `list-ordered`, `check-square`, `quote`, `code`, `table`, `minus`, `image`, `paperclip`, `alert-circle`, `chevron-right`, `columns`, `external-link`, `function-square` and `sparkles`. The built-in commands are translated in the menu when their name is the English name GoTipe gave them.

### Replace the list or the groups

`BlockEditor` takes the whole list as `slashCommands`. Its menu shows the groups `ai`, `style`, `insert` and `upload`, in that order; commands of other groups are hidden. For your own groups, turn the built-in menu off and render `SlashMenu` with `groups`:

```tsx title="editor.tsx"
import { BlockEditor, SlashMenu } from "@gotipe/block-editor";
import { FullPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/react";

const groups = [
  { id: "style", label: "Basic" },
  { id: "insert", label: "Insert" },
  { id: "snippets", label: "Snippets" },
];

export function DocumentEditor() {
  const editor = useEditor({ extensions: [FullPreset] });
  return (
    <BlockEditor editor={editor} showSlashMenu={false}>
      {editor && <SlashMenu editor={editor} commands={editor.getSlashCommands()} groups={groups} />}
    </BlockEditor>
  );
}
```

`SlashMenu` also takes `renderIcon(command)` and `renderMeta(command)` for the row's icon and right-hand hint, and `labels` for its accessible texts.

To build a menu of your own, subscribe to the `openSlashMenu` event with `editor.on`, read `editor.getSlashCommands()`, and remove the "/" text yourself before you run a command.

## Drag and drop

`DragAndDrop` only marks that a setup wants block dragging; it adds no behaviour. Dragging is implemented by the block handles of `BlockEditor` and `PageEditor`, with or without the extension:

- Hover a block to show its handle, then drag the handle. A line shows where the block will land and the page scrolls at its edges. Dropping is one undoable move.
- In a list the handle moves one item; hold Alt to move the whole list.
- With touch or a pen, hold the handle for 300 ms to start dragging; moving earlier cancels. A short tap opens the block menu. Escape, losing focus or a cancelled pointer ends the drag without a change.

To move blocks from code, use `moveBlockUp(blockId?)`, `moveBlockDown(blockId?)` or `moveBlock(blockId, index)` (top level) on `editor.chain()`. Dropping files on the editor is an upload, described in [Media](/docs/extensions/media#image).

## Related

- [Block editor](/docs/ui/block-editor): the menus and handles these behaviours drive.
- [Menus](/docs/ui/menus): `SlashMenu`, the bubble menu and the block menu.
- [Events](/docs/concepts/events): `openSlashMenu` and the other editor events.
- [Extensions](/docs/concepts/extensions): `defineExtension` and `SlashCommandDef`.
