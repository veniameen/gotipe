---
title: React
description: The MIT React adapter: useEditor, useEditorStatus and useEditorState, the Editor and EditorContent renderer, BubbleMenu and FloatingMenu, custom block views and server rendering.
packages: ["@gotipe/react"]
license: MIT
---

`@gotipe/react` creates and destroys the editor with your component, subscribes to its
state and renders the document as React elements, including the table controls. Images
and files are shown read-only; their editing UI is the separate `@gotipe/react/media`
entry. It ships no CSS. The ready [BlockEditor](/docs/ui/block-editor) and
[PageEditor](/docs/ui/page-editor) are built on it.

## Install

```sh
npm install @gotipe/core @gotipe/react react react-dom
```

React 18 or newer. `@gotipe/i18n` comes with the adapter.

## Example

```tsx title="NotesEditor.tsx"
import { DefaultPreset } from "@gotipe/core/presets";
import { Editor, useEditor, useEditorState } from "@gotipe/react";

export function NotesEditor() {
  const editor = useEditor({
    extensions: [DefaultPreset],
    content: "<h1>Notes</h1><p>Select a word and press Bold.</p>",
    onUpdate: ({ editor }) => localStorage.setItem("notes", editor.getMarkdown()),
  });
  const bold = useEditorState(editor, (state) => state.toolbar.activeMarks.includes("bold"));

  return (
    <div>
      <button
        type="button"
        aria-pressed={bold ?? false}
        disabled={!editor}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor?.chain().focus().toggleBold().run()}
      >
        Bold
      </button>
      <Editor editor={editor} ariaLabel="Notes" />
    </div>
  );
}
```

```demo
headless
```

`onMouseDown` with `preventDefault` keeps the selection in the document while you click.
Images and files in this editor are read-only until you provide `@gotipe/react/media`; see
[Image and file editing](#image-and-file-editing).

## Hooks

| Hook | Returns | Description |
|---|---|---|
| `useEditor(options)` | `GoTipeEditor \| null` | Creates the editor after mount, destroys it on unmount. `null` until it exists. |
| `useEditorStatus(options)` | `{ editor, error }` | The same editor, and why it could not be created; see [Creation errors](#creation-errors). |
| `useEditorState(editor, selector, isEqual?)` | `T \| undefined` | Re-renders when `selector(viewState)` changes. `isEqual` compares results (default `Object.is`). |
| `useEditorContext()` | `GoTipeEditor` | The editor of the surrounding `Editor`; throws outside it. |
| `useGoTipeI18n()` | `I18n` | UI strings; English without a provider. |
| `useFloatingPosition(options)` | position or `null` | Places a panel by an anchor inside the visible viewport and follows scroll and resize. |

`useEditor` and `useEditorStatus` take the options of `createEditor` (see
[quick start](/docs/getting-started/quick-start)) and `onError`. They read the editor options
once, when they create the editor: later changes to `content` or callbacks are ignored, so
call `editor.setContent()` or subscribe with `editor.on()`. `onError` is read when a failure
arrives, so the latest one is used. In Strict Mode, an editor that finishes after the first
unmount is destroyed.

Selectors run on every view change, so return small values; with an object, pass `isEqual`.

## Creation errors

Creating the editor can fail: `WASM_INIT_FAILED` with `engine: "wasm"`, `VALIDATION_ERROR`
for a JSON document the schema rejects, `EXTENSION_DEPENDENCY_CYCLE`. `useEditorStatus`
returns the editor with the reason. `error` is `null` while the editor is created and once
it exists, and an `Error` when creation failed; a `GoTipeError` also has a `code`. Both hooks
pass the failure to `onError(error)` once; without `onError`, they log it to the console.

```tsx title="NotesEditor.tsx"
import { DefaultPreset } from "@gotipe/core/presets";
import { Editor, useEditorStatus } from "@gotipe/react";

export function NotesEditor({ report }: { report: (error: Error) => void }) {
  const { editor, error } = useEditorStatus({
    extensions: [DefaultPreset],
    engine: "wasm",
    onError: report,
  });

  if (error) return <p role="alert">The editor could not start: {error.message}</p>;
  return <Editor editor={editor} ariaLabel="Notes" />;
}
```

`onError` reports only the creation. Errors of a working editor, such as a failed upload,
a blocked link or a paste that does not fit, go to `host.onError` and the `error` event; see
[Errors](/docs/concepts/host#errors).

A creation that fails after unmount reports nothing, so Strict Mode, which creates the editor
twice, reports a failure once. When React runs the hook's effect again, after Fast Refresh or
when an `Activity` is shown again, the editor is created anew from the current options and
the previous error is cleared.

## Components

| Component | Props | Description |
|---|---|---|
| `Editor` | `editor`, `blockViews`, `blockRenderer`, `placeholder`, `afterText`, `afterBlock`, `ariaLabel`, `slotBefore`, `slotAfter`, `className`, `style`, `children` | `.gotipe-editor` with context, the document and slots. Renders nothing while `editor` is `null`. |
| `EditorContent` | `editor`, `blockViews`, `blockRenderer`, `placeholder`, `afterText`, `afterBlock`, `ariaLabel` | Only the document surface; it mounts the editor on its element. |
| `BubbleMenu` | `editor`, `children`, `shouldShow`, `offset`, `className`, `ariaLabel` | A `toolbar` above a selection in an editable editor. |
| `FloatingMenu` | `editor`, `children`, `shouldShow`, `ariaLabel` | A `toolbar` left of the focused, empty paragraph under a collapsed caret. |
| `GoTipeI18nProvider` | `locale` or `i18n`, `children` | UI language; see [i18n](/docs/ui/i18n). |

Without `ariaLabel`, the document and both menus are named in the language of
`GoTipeI18nProvider` — `a11y.editorLabel`, `a11y.toolbarLabel` and `a11y.insertLabel`:
"Document content", "Text formatting" and "Insert block" in English and without a
provider; see [i18n](/docs/ui/i18n).

`children` of both menus can be a function `({ editor }) => ReactNode`. `BubbleMenu`
renders into a layer on `<body>` that copies the editor's `--gt-*` tokens, font and
direction. Clicks inside both menus keep the document's selection.

```tsx title="FormattingBubble.tsx"
import type { GoTipeEditor } from "@gotipe/core";
import { BubbleMenu } from "@gotipe/react";

export function FormattingBubble({ editor }: { editor: GoTipeEditor }) {
  return (
    <BubbleMenu editor={editor} ariaLabel="Formatting">
      <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()}>
        Italic
      </button>
    </BubbleMenu>
  );
}
```

## Block views

`blockViews` replaces the view of a block type. A view gets `BlockViewProps` and must
spread `rootProps` on its root element (block id and decorations) and set
`data-block-type`:

```tsx title="Quote.tsx"
import type { BlockViewProps } from "@gotipe/react";

export function Quote({ block, rootProps, content, children }: BlockViewProps) {
  const className = ["pull-quote", rootProps.className].filter(Boolean).join(" ");
  return (
    <blockquote {...rootProps} data-block-type={block.type} className={className}>
      {content}
      {children}
    </blockquote>
  );
}

// <Editor editor={editor} blockViews={{ blockquote: Quote }} />
```

| Prop | Type | Description |
|---|---|---|
| `block` | `BlockView` | The block: id, type, attrs, content, children. |
| `editor` | `GoTipeEditor` | The editor. |
| `content` | `ReactNode` | The block's text with marks and decorations. |
| `children` | `ReactNode` | Child blocks, rendered by the editor. |
| `rootProps` | `Record<string, unknown>` | Attributes the root must carry. |
| `readOnly` | `boolean` | The editor is read-only. |
| `phantom` | `boolean` | Drawn as a suggested block that cannot be edited (`usePhantom()` reads it too). |
| `isSelected`, `selectedBlockId`, `parentType` | | Selection and nesting. |

`placeholder` is `(block, parentType) => string | null` and replaces the empty-block hints;
by default they come from the `placeholder.*` strings. `blockRenderer` is an older wrapper
API; prefer `blockViews`.

`afterText` (`AfterTextFn`) is `(block) => ReactNode`: what a block with text shows right after
its last character, inside its element — `BlockEditor` draws the `docs` view's heading anchors with
it. The node is wrapped as a widget (`data-gotipe-widget`, not editable): it is not part of the
document's text, offsets or copy, and the caret never enters it. A block without text and a
suggested block show nothing. A custom view gets it inside `content`.

`afterBlock` (`BlockSlot | null`) is `{ blockId, node }`: the host's element in the flow of the
document right after the top-level block that is or holds `blockId` (an item's id puts it after
its whole list), spaced as one more block, so the text below moves down for it. It is a widget
(`.gotipe-block-slot`, `data-gotipe-widget`, not editable): not part of the text, offsets, copy or
file, and the editor does not handle its input. It keeps its element while it moves to another
block, and an unknown id or `null` shows nothing. Block ids can change when the document is
replaced (`setMarkdown`): the element is then drawn anew, so the host keeps its state.

A block type with no view, such as your own node without `blockViews`, is drawn as a `<p>`
with its text; with child blocks, as a `<div>` with its text and then the children.

### Long documents

A block the built-in views draw is drawn again only when it changes, when the caret enters or
leaves it, or when the editor becomes read-only or editable: typing in one paragraph of a long
document does not redraw the others. A block with a custom view, and the blocks above it, are
drawn on every change of the editor, because a view may read the editor as it draws.

A view that draws only from its props, hooks and contexts can say so with `pure`; whatever else
it shows it subscribes to with `useEditorState`:

```tsx title="Quote.tsx"
Quote.pure = true;
```

In a pure view `selectedBlockId` names the caret's block only while that is the view's block or a
block under it; otherwise it is `""`. A code block and a block drawn by `blockRenderer` are always
drawn again.

The building blocks of the default views are exported for your own views: `TableBlock`,
`TableColumnResizeHandle`, `CodeBlock`, `ToggleBlock`, `CalloutBlock`, `TextRenderer`
and `FloatingPortal`; `ImageBlock` and `FileBlock` come from `@gotipe/react/media`. `useResolvedAsset` and
`saveAssetWithHost` go through the [host](/docs/concepts/host) asset callbacks.

## Image and file editing

`EditorContent` shows images and files as the reader sees them: the picture with its
width and caption, the failed state, and a file card whose name opens or downloads the
file. Editing them (upload, link, resize, crop, caption, alt text, preview and the image
actions menu) lives in `@gotipe/react/media`, so an app that only displays documents does
not load it. Turn it on with `MediaBlocksContext`:

```tsx title="MediaEditor.tsx"
import type { GoTipeEditor } from "@gotipe/core";
import { Editor, MediaBlocksContext } from "@gotipe/react";
import { mediaBlocks } from "@gotipe/react/media";

export function MediaEditor({ editor }: { editor: GoTipeEditor | null }) {
  return (
    <MediaBlocksContext.Provider value={mediaBlocks}>
      <Editor editor={editor} />
    </MediaBlocksContext.Provider>
  );
}
```

`BlockEditor` and `PageEditor` provide it themselves. `@gotipe/react/media` also exports
`ImageBlock` and `FileBlock` for your own block views; `MediaBlocks` and `MediaBlockProps`
type a replacement pair.

`MediaOptionsContext` sets what these blocks offer: `links: false` hides **By link**, and
`inlineErrors: false` keeps the reasons of failures out of the blocks while every failure
still reaches `host.onError` (see [editor UI options](/docs/extensions/media#editor-ui-options)).
`BlockEditor` and `PageEditor` take the same object as their `media` prop. `useMediaOptions()`
returns the options in force, defaults filled in, for your own block views.

```tsx
<MediaOptionsContext.Provider value={{ links: false, inlineErrors: false }}>
  <Editor editor={editor} />
</MediaOptionsContext.Provider>
```

## Server rendering

The editor is created in an effect, so a server render outputs no document and creates
nothing: `useEditorStatus` returns `{ editor: null, error: null }`, `Editor` renders nothing
and `BlockEditor` renders its loading skeleton. To serve the content as HTML, render it with
[renderToHtml](/docs/conversion/server) from `@gotipe/core/server` and replace it on the
client.

> [!NOTE]
> The packages carry no `"use client"` directive. In a framework with React Server
> Components, import them from a client component.

## Limitations

- A failed creation is not tried again by itself. To retry, mount the component anew, for
  example with a new `key`.
- Changing `content`, `extensions` or `engine` after mount does not create a new editor; the
  hooks read the options only when they create one.

## Related

- [Block editor](/docs/ui/block-editor) · [Menus](/docs/ui/menus) · [Events](/docs/concepts/events)
- [Vue](/docs/frameworks/vue) · [Svelte and Solid](/docs/frameworks/svelte-solid)
