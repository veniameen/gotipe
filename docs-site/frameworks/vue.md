---
title: Vue
description: The MIT Vue adapter with useEditor, useEditorState and EditorContent, and the minimal commercial block editor shell for Vue.
packages: ["@gotipe/vue", "@gotipe/block-editor-vue"]
---

Vue has two packages. `@gotipe/vue` (MIT) creates the editor with your component,
subscribes to its state and renders the document. `@gotipe/block-editor-vue` (commercial)
is an early block editor shell with a basic slash menu and toolbar. The full ready UI
(formatting bubble, block menu, table and media controls, `PageEditor`, review) exists
only for [React](/docs/frameworks/react) today.

## Install

```sh
npm install @gotipe/core @gotipe/vue vue
```

Vue 3.4 or newer.

## Example

```vue title="NotesEditor.vue"
<script setup lang="ts">
import { DefaultPreset } from "@gotipe/core/presets";
import { EditorContent, useEditor, useEditorState } from "@gotipe/vue";

const editor = useEditor({
  extensions: [DefaultPreset],
  content: "<h1>Notes</h1><p>Select a word and press Bold.</p>",
});
const bold = useEditorState(editor, (state) => state.toolbar.activeMarks.includes("bold"));

function toggleBold() {
  editor.value?.chain().focus().toggleBold().run();
}
</script>

<template>
  <button type="button" :aria-pressed="bold ?? false" :disabled="!editor" @mousedown.prevent @click="toggleBold">
    Bold
  </button>
  <EditorContent :editor="editor" aria-label="Notes" />
</template>
```

`@mousedown.prevent` keeps the selection in the document while you click.

## API

| Export | Description |
|---|---|
| `useEditor(options)` | `ShallowRef<GoTipeEditor \| null>`. Creates the editor in `onMounted`, destroys it in `onBeforeUnmount`. The options are read once. |
| `useEditorStatus(options)` | `{ editor, error }`, two `ShallowRef`s: the same editor, and why it could not be created; see [Creation errors](#creation-errors). |
| `useEditorState(editor, selector)` | `ShallowRef<T \| undefined>` with `selector(viewState)`, updated on every view change. |
| `EditorContent` | The document surface. Mounts the editor on its element and unmounts it on change; never destroys an editor you pass. |
| `editorKey`, `useEditorContext()` | Provide an editor to child components and read it; `useEditorContext` throws without one. |

| `EditorContent` prop | Type | Default | Description |
|---|---|---|---|
| `editor` | `GoTipeEditor \| ShallowRef<GoTipeEditor \| null> \| null` | `null` | The editor or the ref from `useEditor`. |
| `blockViews` | `VueBlockViews` | `{}` | Your render functions by block type. |
| `ariaLabel` | `string` | `"Document content"` | Accessible name of the document. |

`EditorContent` does not provide the editor to its children. Call
`provide(editorKey, editor)` in your component when children use `useEditorContext()`.

## Block views

A view is a render function. Spread `rootProps` (key, `data-block-id`, `data-block-type`)
on its root element:

```ts title="block-views.ts"
import type { VueBlockViews } from "@gotipe/vue";
import { h } from "vue";

export const blockViews: VueBlockViews = {
  blockquote: ({ rootProps, content, children }) =>
    h("blockquote", { ...rootProps, class: "pull-quote" }, [...content, ...children]),
};
```

A view receives `block`, `editor`, `content` and `children` (arrays of vnodes), `rootProps`
and `readOnly`.

`EditorContent` renders paragraphs, headings, all three list kinds with task checkboxes,
code blocks, quotes, dividers, tables, callouts with their emoji, toggles as `<details>`,
columns, images (through `host.resolveAsset`), files and embeds as buttons that open their
link, math as its TeX source (the block's text), and raw Markdown blocks. Marks: bold, italic, underline, strikethrough, code,
superscript, subscript, links with safe addresses only, highlight and text colour.

## Block editor for Vue

```sh
npm install @gotipe/block-editor-vue @gotipe/theme @gotipe/core @gotipe/vue vue
```

```vue title="DocumentEditor.vue"
<script setup lang="ts">
import "@gotipe/theme/base.css";
import "@gotipe/theme/theme.css";
import { BlockEditorVue, BlockToolbarVue, SlashMenuVue } from "@gotipe/block-editor-vue";
import { FullPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/vue";

const editor = useEditor({ extensions: [FullPreset], content: "<p>Type / for blocks.</p>" });
</script>

<template>
  <BlockEditorVue :editor="editor" aria-label="Document">
    <template v-if="editor">
      <BlockToolbarVue :editor="editor" />
      <SlashMenuVue :editor="editor" :commands="editor.getSlashCommands()" />
    </template>
  </BlockEditorVue>
</template>
```

| Component | Props | Description |
|---|---|---|
| `BlockEditorVue` | `editor`, `blockViews`, `ariaLabel`, `class` | `.gotipe-block-editor` around `EditorContent`. Provides the editor and renders its slot once the editor exists. |
| `SlashMenuVue` | `editor`, `commands` | Opens when the editor emits `openSlashMenu` and lists every command; a click runs one. |
| `BlockToolbarVue` | `editor` | A static toolbar: `+` adds a paragraph after the current block, the more button offers Duplicate and Delete for it. |

## Server rendering

The editor is created in `onMounted`, so a server render outputs an empty `.gotipe-content`
element. An editor that finishes after the component is gone is destroyed.

### Creation errors

`useEditor` and `useEditorStatus` take the options of `createEditor` and `onError`. When the
editor cannot be created, for example `WASM_INIT_FAILED` with `engine: "wasm"` or
`VALIDATION_ERROR` for a JSON document the schema rejects, `error` becomes the failure and
`onError(error)` is called once; without `onError`, the failure is logged to the console.
`error` is an `Error` (a rejection that is not one becomes one, with the reason as its
`cause`); a `GoTipeError` also has a `code`. A creation that fails after unmount reports
nothing.

```vue title="EditorError.vue"
<script setup lang="ts">
import { DefaultPreset } from "@gotipe/core/presets";
import { EditorContent, useEditorStatus } from "@gotipe/vue";

const { editor, error } = useEditorStatus({
  extensions: [DefaultPreset],
  engine: "wasm",
  onError: (failure) => console.warn("The editor is unavailable:", failure.message),
});
</script>

<template>
  <p v-if="error" role="alert">The editor could not start: {{ error.message }}</p>
  <EditorContent v-else :editor="editor" aria-label="Notes" />
</template>
```

`onError` reports only the creation. Errors of a working editor, such as a failed upload,
a blocked link or a paste that does not fit, go to `host.onError` and the `error` event; see
[Errors](/docs/concepts/host#errors).

## Limitations

- `EditorContent` draws the decorations (comment and suggestion highlights, collaborators'
  cursors and selections, ghost text, the `Placeholder` text) but not React's own hints in
  empty blocks. It has no code highlighting, table bars, resize handles or menus, and no
  image toolbar or upload UI.
- A callout without its own emoji (the default) has no icon: the icons of the callout kinds
  that React draws are not in `@gotipe/vue`.
- `SlashMenuVue` does not filter as you type, has no keyboard navigation or positioning,
  does not close on Escape or an outside click, and leaves the `/` in the text. Its rows
  show the icon name as text.
- `BlockToolbarVue` is not placed beside blocks, and its grip button does not drag.
  Labels in both components are English.
- An editor that could not be created is not created again: mount the component anew.
- `BlockEditorVue` has no `view` prop. It uses the `notion` tokens unless a wrapper
  element carries `data-gt-view`.
- There is no `PageEditor`, formatting bubble, block menu or review UI for Vue.

## Related

- [React](/docs/frameworks/react) · [Svelte and Solid](/docs/frameworks/svelte-solid)
- [Theming](/docs/ui/theming) · [Licensing](/docs/resources/licensing)
