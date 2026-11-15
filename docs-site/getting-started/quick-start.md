---
title: Quick start
description: Put a working GoTipe editor on the page with React, Markdown, a headless setup or Vue.
packages: ["@gotipe/block-editor", "@gotipe/core", "@gotipe/react", "@gotipe/vue"]
---

Four ways to get an editor running. The first two use the ready UI from
`@gotipe/block-editor` (commercial); the last two use only MIT packages and your own
controls. All four run on the JS engine, so they need no WebAssembly setup. If your bundler
reports that it can't resolve `@gotipe/wasm`, add the alias from
[installation](/docs/getting-started/installation#js-only-builds).

```demo
block-editor
```

## Install

For `BlockEditor` or `PageEditor`:

```sh
npm install @gotipe/block-editor @gotipe/core @gotipe/react @gotipe/theme @gotipe/i18n @gotipe/markdown @gotipe/suggestions react react-dom
```

For a headless React editor:

```sh
npm install @gotipe/core @gotipe/react react react-dom
```

For Vue:

```sh
npm install @gotipe/core @gotipe/vue vue
```

## Create an editor

```tsx tab="BlockEditor" title="Editor.tsx"
import { BlockEditor } from "@gotipe/block-editor";
import { FullPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/react";
import "@gotipe/theme/base.css";
import "@gotipe/theme/theme.css";

const INITIAL = {
  version: 1,
  blocks: [
    {
      id: "title",
      type: "heading",
      attrs: { level: 1 },
      content: [{ text: "Welcome", marks: [] }],
      children: [],
    },
    {
      id: "intro",
      type: "paragraph",
      attrs: {},
      content: [
        { text: "Type ", marks: [] },
        { text: "/", marks: [{ type: "code", attrs: {} }] },
        { text: " to insert a block.", marks: [] },
      ],
      children: [],
    },
  ],
};

export function Editor() {
  const editor = useEditor({
    extensions: [FullPreset],
    content: INITIAL,
    engine: "js",
    onUpdate: ({ editor }) => localStorage.setItem("doc", JSON.stringify(editor.getJSON())),
  });
  return <BlockEditor editor={editor} showAiCommandBar={false} />;
}
```

```tsx tab="PageEditor (Markdown)" title="Page.tsx"
import { PageEditor } from "@gotipe/block-editor";
import { useState } from "react";
import "@gotipe/theme/base.css";
import "@gotipe/theme/theme.css";

export function Page() {
  const [markdown, setMarkdown] = useState("# Release notes\n\nStart writing.\n");
  return (
    <>
      <PageEditor markdown={markdown} onChange={setMarkdown} />
      <pre>{markdown}</pre>
    </>
  );
}
```

```tsx tab="React headless" title="Editor.tsx"
import type { GoTipeEditor } from "@gotipe/core";
import { DefaultPreset } from "@gotipe/core/presets";
import { EditorContent, useEditor, useEditorState } from "@gotipe/react";
import type { MouseEvent } from "react";

// Keep the caret in the document when a button is pressed.
const keepFocus = (event: MouseEvent) => event.preventDefault();

function Toolbar({ editor }: { editor: GoTipeEditor }) {
  const toolbar = useEditorState(editor, (state) => state.toolbar);
  const marks = toolbar?.activeMarks ?? [];
  return (
    <div role="toolbar" aria-label="Formatting">
      <button
        type="button"
        aria-pressed={marks.includes("bold")}
        onMouseDown={keepFocus}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        Bold
      </button>
      <button
        type="button"
        aria-pressed={marks.includes("italic")}
        onMouseDown={keepFocus}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        Italic
      </button>
      <button
        type="button"
        onMouseDown={keepFocus}
        onClick={() => editor.chain().focus().setBlockType("heading", { level: 2 }).run()}
      >
        Heading
      </button>
      <button
        type="button"
        onMouseDown={keepFocus}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        List
      </button>
      <button
        type="button"
        disabled={!toolbar?.canUndo}
        onMouseDown={keepFocus}
        onClick={() => editor.chain().focus().undo().run()}
      >
        Undo
      </button>
    </div>
  );
}

export function Editor() {
  const editor = useEditor({
    extensions: [DefaultPreset],
    engine: "js",
    content: {
      version: 1,
      blocks: [
        {
          id: "intro",
          type: "paragraph",
          attrs: {},
          content: [{ text: "Select some text and press Bold.", marks: [] }],
          children: [],
        },
      ],
    },
  });
  if (!editor) return null;
  return (
    <>
      <Toolbar editor={editor} />
      <EditorContent editor={editor} ariaLabel="Document" />
    </>
  );
}
```

```vue tab="Vue" title="Editor.vue"
<script setup lang="ts">
import { DefaultPreset } from "@gotipe/core/presets";
import { EditorContent, useEditor, useEditorState } from "@gotipe/vue";

const editor = useEditor({
  extensions: [DefaultPreset],
  engine: "js",
  content: {
    version: 1,
    blocks: [
      {
        id: "intro",
        type: "paragraph",
        attrs: {},
        content: [{ text: "Hello from Vue.", marks: [] }],
        children: [],
      },
    ],
  },
});
const marks = useEditorState(editor, (state) => state.toolbar.activeMarks);

function toggleBold() {
  editor.value?.chain().focus().toggleBold().run();
}
</script>

<template>
  <button
    type="button"
    :aria-pressed="marks?.includes('bold')"
    @mousedown.prevent
    @click="toggleBold"
  >
    Bold
  </button>
  <EditorContent :editor="editor" aria-label="Document" />
</template>
```

What happens here:

- `useEditor` creates the editor once, when the component mounts, and destroys it on
  unmount. It returns `null` (React) or a ref holding `null` (Vue) until the editor is
  ready. Options are read once; later changes to them are ignored.
- `BlockEditor` shows a loading skeleton while `editor` is `null`. `showAiCommandBar` is
  turned off here; without the [AI extensions](/docs/ai/overview) the editor shows no AI
  controls anyway.
- `PageEditor` creates its own editor. After edits it calls `onChange` with the whole
  Markdown text, at most once per animation frame; debounce saving in your code. Blocks you
  did not touch keep their original bytes.
- `EditorContent` mounts the editor on its element and renders the blocks. Toolbar buttons
  call [commands](/docs/concepts/commands); `focus()` returns the caret to the document
  before the command runs.
- `EditorContent` shows images and files read-only. To upload, resize, crop or caption
  them, wrap it in `<MediaBlocksContext.Provider value={mediaBlocks}>` with `mediaBlocks`
  from `@gotipe/react/media` (see [React](/docs/frameworks/react#image-and-file-editing));
  `BlockEditor` and `PageEditor` already include it.

## Editor options

`useEditor` takes the options of `createEditor` from `@gotipe/core`:

| Option | Type | Default | Description |
|---|---|---|---|
| `extensions` | `(Extension \| Extension[])[]` | required | Block types, marks and behaviour. Presets are arrays and mix with single extensions. |
| `content` | `object \| string` | one empty paragraph | Document JSON, or an HTML string (browser only). See [content formats](/docs/concepts/content-formats). |
| `editable` | `boolean` | `true` | `false` blocks user input. Commands and `dispatch` still work. |
| `autofocus` | `boolean \| "start" \| "end"` | `false` | Focus the surface when it is mounted. |
| `engine` | `"auto" \| "js" \| "wasm"` | `"auto"` | Which engine runs the document. See [engines](/docs/getting-started/engines). |
| `host` | `EditorHost` | `{}` | Asset storage, links and errors. See [host](/docs/concepts/host). |
| `onCreate`, `onUpdate`, `onSelectionChange`, `onFocus`, `onBlur`, `onDestroy` | `({ editor }) => void` | — | Listeners for the matching [events](/docs/concepts/events). |

The presets come from `@gotipe/core/presets`:

| Preset | Contents |
|---|---|
| `MinimalPreset` | Paragraph, bold, italic, history |
| `DefaultPreset` | Paragraphs, headings, bullet, numbered and to-do lists, code blocks, images, quotes, callouts, dividers, tables, toggles; bold, italic, underline, strikethrough, inline code, links, highlight, text colour; history, placeholder, slash commands |
| `FullPreset` | `DefaultPreset` plus columns, embeds, math, files, superscript and subscript |

> [!NOTE]
> `autofocus: "start"` and `"end"` currently behave like `true`: the surface gets focus and
> the caret is not moved. Call `editor.focus("end")` after mounting to place it.

## Next steps

- [Document model](/docs/concepts/document-model): what `content` and `getJSON()` contain.
- [BlockEditor](/docs/ui/block-editor) and [PageEditor](/docs/ui/page-editor) props.
- [React](/docs/frameworks/react) and [Vue](/docs/frameworks/vue) adapters in depth.
