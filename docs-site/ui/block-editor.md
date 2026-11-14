---
title: Block editor
description: BlockEditor is the ready React editing surface with the slash menu, block handle, formatting bubble, page head and four views.
packages: ["@gotipe/block-editor", "@gotipe/theme", "@gotipe/react"]
license: Commercial
---

`BlockEditor` draws a GoTipe editor with its whole interface: the `/` menu, the block handle
with drag and the block menu, the formatting bubble, table and media controls, and the four
views. You create the editor with `useEditor` from `@gotipe/react` and pass it in, so the
document, extensions and host stay yours. For Markdown files use
[PageEditor](/docs/ui/page-editor), which is built on `BlockEditor`.

> [!IMPORTANT]
> `@gotipe/block-editor` and `@gotipe/theme` are under the GoTipe Commercial License. See
> [licensing](/docs/resources/licensing).

## Install

```sh
npm install @gotipe/block-editor @gotipe/core @gotipe/react @gotipe/theme @gotipe/i18n @gotipe/markdown @gotipe/suggestions react react-dom
```

Import the styles once. `base.css` draws the document, `theme.css` the menus, panels and
states. `@gotipe/block-editor/styles` loads only `theme.css`, so you still need
`base.css`.

```ts title="main.ts"
import "@gotipe/theme/base.css";
import "@gotipe/theme/theme.css";
```

## Example

```tsx title="NotesEditor.tsx"
import { BlockEditor, PageHead } from "@gotipe/block-editor";
import { FullPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/react";
import { useState } from "react";

export function NotesEditor() {
  const editor = useEditor({
    extensions: [FullPreset],
    content: "<p>Type / to insert a block.</p>",
  });
  const [title, setTitle] = useState("Release notes");

  return (
    <BlockEditor
      editor={editor}
      view="notion"
      showAiCommandBar={false}
      header={
        <PageHead title={title} onTitleChange={setTitle} onTitleEnter={() => editor?.focus("start")} />
      }
    />
  );
}
```

```demo
block-editor
```

While `editor` is `null` (before `useEditor` resolves, and during server rendering) the
root shows a loading skeleton with `role="status"`.

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `editor` | `GoTipeEditor \| null` | — | The editor to draw. `null` shows the skeleton. |
| `view` | `"notion" \| "docs" \| "modern" \| "minimal"` | `"notion"` | The view, set as `data-gt-view` on the root. |
| `header` | `ReactNode` | — | Drawn above the document, usually a `PageHead`. |
| `starters` | `boolean` | on with `header` in notion and docs | Quick blocks under an empty page. |
| `highlight` | `CodeHighlighter` | — | Code highlighter, for example Shiki from `@gotipe/block-editor/shiki`; see [code block](/docs/extensions/code-block). |
| `showSlashMenu` | `boolean` | `true` | The `/` menu. The `+` button opens it only when this is on. |
| `showBlockToolbar` | `boolean` | `true` | The block handle: `+`, drag grip and block menu. |
| `showBubbleMenu` | `boolean` | `true` | The formatting bubble over a selection. |
| `showAiCommandBar` | `boolean` | `true` | AI command bar (Mod+J), ghost text, AI status and the bubble's Improve button. |
| `onAiCommand` | `(prompt: string) => void` | — | Receives the bar's prompt instead of the AI extension. |
| `showThemeToggle` | `boolean` | `false` | Light, dark and system switch above the header. |
| `remotePeers` | `RemotePeer[]` | — | Collaborators' cursors and selections to draw besides those of the editor's `collaboration` decoration layer, which the [provider](/docs/collaboration/provider) fills. Each peer is drawn once. |
| `showCollaborationCursors` | `boolean` | — | Declared but not read; see the note below. |
| `suggestions` | `Suggestion[]` | — | Proofreading suggestions for the suggestion bar. |
| `onSuggestionAccept` | `(suggestion: Suggestion) => void` | — | With `onSuggestionReject`, shows the suggestion bar. |
| `onSuggestionReject` | `(suggestion: Suggestion) => void` | — | See `onSuggestionAccept`. |
| `onSuggestionAcceptAll` | `() => void` | no-op | Accept all button. |
| `onSuggestionRejectAll` | `() => void` | no-op | Reject all button. |
| `blockViews` | `BlockViews` | — | Your views by block type; they win over the editor's own. |
| `slashCommands` | `SlashCommandDef[]` | `editor.getSlashCommands()` | Commands of the `/` menu. |
| `ariaLabel` | `string` | `"Document content"` | Accessible name of the document. |
| `errorToast` | `boolean` | `true` | A toast for errors a person can act on. |
| `find` | `boolean` | `true` | The [find bar](/docs/extensions/find-replace#the-find-bar-of-blockeditor) (`Mod+F`, `Mod+Alt+F`) when the editor has `FindReplace`. |
| `status` | `boolean \| StatusLineOptions` | `false` | Words and characters under the document, with an optional limit; see [the counter line](/docs/extensions/character-count#the-counter-line-of-blockeditor). Needs `CharacterCount`. |
| `className` | `string` | — | Added to the root `.gotipe-block-editor`. |
| `style` | `CSSProperties` | — | Style of the root; `position: relative` is kept. |
| `children` | `ReactNode` | — | Rendered inside the editor after the document. |

`BlockEditor` has no read-only prop. Create the editor with `editable: false` or call
`editor.setEditable(false)`; the handle, the bubble and the `/` menu then stay hidden.

## Views

A view is a set of `--gt-*` tokens over the same markup. Switching it never re-creates the
editor. Colours, fonts and dark mode are covered in [theming](/docs/ui/theming).

| View | For | What changes |
|---|---|---|
| `notion` | Pages assembled block by block | 680 px column, body 15/24 px, block handle in the gutter |
| `docs` | Reference pages | Body 14/22 px, outline of h1–h3 beside the text, line numbers in code, no handle |
| `modern` | Forms and CMS fields under a toolbar | Smaller title and top space, no handle |
| `minimal` | An editor as a field in another interface | 640 px column, body 14/22 px, no handle |

The `docs` outline appears with two or more headings and hides in containers 640 px wide or
less. The `modern` view expects a fixed toolbar above it; GoTipe does not ship that toolbar.

## Page head

`PageHead` is the head of a page: an icon, the title, the host's byline and a read-only
sign. The host owns the title's value; it is not part of the document.

| Prop | Type | Default | Description |
|---|---|---|---|
| `title` | `string` | — | Plain-text title. |
| `onTitleChange` | `(title: string) => void` | — | Makes the title editable (unless `readOnly`). |
| `onTitleEnter` | `() => void` | — | Enter in the title, for example to move the caret into the document. |
| `placeholder` | `string` | `"Untitled"` | Shown while the title is empty. |
| `icon` | `ReactNode` | — | The page's icon, chosen by the host. |
| `onAddIcon` | `() => void` | — | Shows an "Add icon" button when there is no icon. |
| `byline` | `ReactNode` | — | Slot under the title: authors, dates. |
| `readOnly` | `boolean \| string` | — | Shows a lock; a string is the reason shown on hover and focus. |
| `labels` | `{ addIcon?: string; readOnly?: string }` | — | Overrides of the two built-in strings. |

## Starters

On an empty page (one empty paragraph, editable) `starters` adds buttons for a to-do list, a
table, a code block and an image. Each runs the slash command with the same icon, and a
button appears only when the editor has that command.

## Errors

The toast shows errors with these codes for four seconds: `TRANSFORM_ERROR`,
`CLIPBOARD_FAILED`, `ASSET_SAVE_FAILED`, `ASSET_RESOLVE_FAILED`, `ASSET_UNSUPPORTED`,
`ASSET_TOO_LARGE`, `LINK_BLOCKED`, `LINK_OPEN_FAILED`, `COLLABORATION_ERROR`,
`PROPOSAL_ACTION_FAILED` and `COMMENT_ACTION_FAILED`. Other errors go to `console.error`.
If you report errors yourself through `host.onError`, set `errorToast={false}`.

## Other components

| Export | Use |
|---|---|
| `SlashMenu`, `BlockToolbar`, `DragHandle`, `BlockContextMenu` | The parts of the `/` menu and the handle; see [menus](/docs/ui/menus). |
| `BlockEditorBubbleMenu`, `BlockTypeDropdown`, `TextColorPicker` | The formatting bubble and its parts. |
| `TableColumnButton`, `TableRowButton` | Column and row menus of tables. |
| `CollaborationCursors` | Remote cursors; see [collaboration](/docs/collaboration/overview). |
| `CommentSidebar`, `SuggestionToolbar` | Review UI; see [comments](/docs/review/comments). |
| `AiCommandBar`, `AiStatusIndicator`, `GhostText` | AI UI; see [AI UI](/docs/ai/ui). |
| `ThemeToggle`, `EditorSkeleton`, `EditorErrorToast`, `EditorStarters` | Theme switch and the loading, error and empty states. |

The UI speaks English by default. Wrap the editor in `GoTipeI18nProvider` for other
languages; see [i18n](/docs/ui/i18n).

## Limitations

- `showCollaborationCursors` has no effect: cursors are drawn whenever `remotePeers` or the
  editor's `collaboration` decoration layer has entries.
- `showAiCommandBar` is on by default and adds the Improve button and Mod+J even when no
  AI extension is installed. Turn it off unless you use [AI](/docs/ai/overview).
- The bubble's More menu always offers superscript and subscript. Load those extensions
  (`FullPreset` has them, `DefaultPreset` does not), or the actions fail with an error.
- The block handle is shown only in the `notion` view.
- To change the `/` menu's groups or labels, set `showSlashMenu={false}` and render your
  own `SlashMenu` as a child; the `+` button then adds an empty block without the menu.

## Related

- [Menus and controls](/docs/ui/menus) · [Keyboard and accessibility](/docs/ui/keyboard)
- [Page editor](/docs/ui/page-editor) · [Theming](/docs/ui/theming) · [React](/docs/frameworks/react)
