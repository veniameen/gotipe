# @gotipe/vue

The Vue 3 adapter for GoTipe: composables that create and observe an editor, and an
`EditorContent` component that renders its document. It ships no CSS and no ready editor UI.

[Docs](https://gotipe.com/docs/frameworks/vue/) · [Website](https://gotipe.com) · [Repository](https://github.com/veniameen/gotipe)

## Install

```sh
npm install @gotipe/core @gotipe/vue vue
```

Vue 3.4 or newer.

## Usage

```vue
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

- `useEditor(options)`: a `ShallowRef` with the editor, created in `onMounted` and destroyed
  in `onBeforeUnmount`.
- `useEditorStatus(options)`: the same editor and why it could not be created.
- `useEditorState(editor, selector)`: a `ShallowRef` updated on every view change.
- `EditorContent`: the document surface; props `editor`, `blockViews` and `ariaLabel`.
- `editorKey`, `useEditorContext()`: provide an editor to child components and read it.

## License

MIT. See [LICENSE](https://github.com/veniameen/gotipe/blob/main/packages/vue/LICENSE).
