# @gotipe/react

The React adapter for GoTipe: hooks that create and observe an editor, and components that
render its document, menus and table controls. It ships no CSS; the ready
[`@gotipe/block-editor`](https://www.npmjs.com/package/@gotipe/block-editor) is built on it.

[Docs](https://gotipe.com/docs/frameworks/react/) · [Website](https://gotipe.com) · [Repository](https://github.com/veniameen/gotipe)

## Install

```sh
npm install @gotipe/core @gotipe/react react react-dom
```

React 18 or newer. `@gotipe/i18n` comes with the adapter.

## Usage

```tsx
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

`useEditor` takes the options of `createEditor` from `@gotipe/core`, reads them once and
returns `null` until the editor exists.

- `useEditor`, `useEditorStatus`: create the editor with the component; `useEditorStatus`
  also returns why creation failed.
- `useEditorState(editor, selector)`: re-renders when the selected part of the view changes.
- `Editor`, `EditorContent`: the document surface, with or without context and slots.
- `BubbleMenu`, `FloatingMenu`: toolbars over a selection and beside an empty paragraph.
- `GoTipeI18nProvider`, `useGoTipeI18n`: the language of the UI strings.
- `@gotipe/react/media`: `mediaBlocks` for upload, resize, crop and captions of images and
  files, turned on with `MediaBlocksContext`.

## License

MIT. See [LICENSE](https://github.com/veniameen/gotipe/blob/main/packages/react/LICENSE).
