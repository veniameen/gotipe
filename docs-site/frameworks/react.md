---
title: React
description: The MIT React adapter: useEditor and useEditorState, the Editor and EditorContent renderer, BubbleMenu and FloatingMenu, custom block views and server rendering.
packages: ["@gotipe/react"]
license: MIT
---

`@gotipe/react` creates and destroys the editor with your component, subscribes to its
state and renders the document as React elements, including the table controls and the
image and file UI. It ships no CSS. The ready [BlockEditor](/docs/ui/block-editor) and
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

## Hooks

| Hook | Returns | Description |
|---|---|---|
| `useEditor(options)` | `GoTipeEditor \| null` | Creates the editor after mount, destroys it on unmount. `null` until it exists. |
| `useEditorState(editor, selector, isEqual?)` | `T \| undefined` | Re-renders when `selector(viewState)` changes. `isEqual` compares results (default `Object.is`). |
| `useEditorContext()` | `GoTipeEditor` | The editor of the surrounding `Editor`; throws outside it. |
| `useGoTipeI18n()` | `I18n` | UI strings; English without a provider. |
| `useFloatingPosition(options)` | position or `null` | Places a panel by an anchor inside the visible viewport and follows scroll and resize. |

`useEditor` takes the options of `createEditor` (see
[quick start](/docs/getting-started/quick-start)) and reads them once. Later changes to
`content` or callbacks are ignored: call `editor.setContent()` or subscribe with
`editor.on()`. A creation error is logged to the console. In Strict Mode, an editor that
finishes after the first unmount is destroyed.

Selectors run on every view change, so return small values; with an object, pass `isEqual`.

## Components

| Component | Props | Description |
|---|---|---|
| `Editor` | `editor`, `blockViews`, `blockRenderer`, `placeholder`, `ariaLabel`, `slotBefore`, `slotAfter`, `className`, `style`, `children` | `.gotipe-editor` with context, the document and slots. Renders nothing while `editor` is `null`. |
| `EditorContent` | `editor`, `blockViews`, `blockRenderer`, `placeholder`, `ariaLabel` | Only the document surface; it mounts the editor on its element. |
| `BubbleMenu` | `editor`, `children`, `shouldShow`, `offset`, `className`, `ariaLabel` | A `toolbar` above a selection in an editable editor. |
| `FloatingMenu` | `editor`, `children`, `shouldShow` | A `toolbar` left of the focused, empty paragraph under a collapsed caret. |
| `GoTipeI18nProvider` | `locale` or `i18n`, `children` | UI language; see [i18n](/docs/ui/i18n). |

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

The building blocks of the default views are exported for your own views: `TableBlock`,
`TableColumnResizeHandle`, `CodeBlock`, `ImageBlock`, `FileBlock`, `ToggleBlock`,
`CalloutBlock`, `TextRenderer` and `FloatingPortal`. `useResolvedAsset` and
`saveAssetWithHost` go through the [host](/docs/concepts/host) asset callbacks.

## Server rendering

The editor is created in an effect, so a server render outputs no document: `Editor`
renders nothing and `BlockEditor` renders its loading skeleton. To serve the content as
HTML, render it with [renderToHtml](/docs/conversion/server) from `@gotipe/core/server`
and replace it on the client.

> [!NOTE]
> The packages carry no `"use client"` directive. In a framework with React Server
> Components, import them from a client component.

## Related

- [Block editor](/docs/ui/block-editor) · [Menus](/docs/ui/menus) · [Events](/docs/concepts/events)
- [Vue](/docs/frameworks/vue) · [Svelte and Solid](/docs/frameworks/svelte-solid)
