# @gotipe/block-editor

The ready React editing UI for GoTipe: `BlockEditor` with the `/` menu, block handle and drag,
formatting bubble, table and media controls and four views, and `PageEditor`, which edits a
Markdown file and gives Markdown back.

[Docs](https://gotipe.com/docs/ui/block-editor/) · [Page editor](https://gotipe.com/docs/ui/page-editor/) · [Website](https://gotipe.com) · [Repository](https://github.com/veniameen/gotipe)

## Install

```sh
npm install @gotipe/block-editor @gotipe/core @gotipe/react @gotipe/theme @gotipe/i18n @gotipe/markdown @gotipe/suggestions @gotipe/versions react react-dom
```

React 18 or newer. `shiki` (^1.22) is an optional peer for code highlighting through
`@gotipe/block-editor/shiki`.

## Usage

Import the styles once (`import "@gotipe/block-editor/styles"` loads the same two files):

```ts
import "@gotipe/theme/base.css";
import "@gotipe/theme/theme.css";
```

Create the editor with `useEditor` from `@gotipe/react` and pass it in:

```tsx
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

For a Markdown file, `PageEditor` creates its own editor. An unchanged file comes back byte for
byte, and an edit rewrites only the blocks it touched:

```tsx
import { PageEditor } from "@gotipe/block-editor";
import { useState } from "react";

export function Page() {
  const [markdown, setMarkdown] = useState("# Release notes\n\nStart writing.\n");
  return <PageEditor markdown={markdown} onChange={setMarkdown} />;
}
```

- `BlockEditor`: `editor`, `view` (`"notion"`, `"docs"`, `"modern"`, `"minimal"`), `header`,
  `highlight`, `showSlashMenu`, `showBlockToolbar`, `showBubbleMenu`, `showThemeToggle` and more.
- `PageEditor`: `markdown`, `onChange`, `locale`, `titlePlaceholder`, `view`, and a review layer
  for suggestions and comments.
- Parts for your own layout: `SlashMenu`, `BlockToolbar`, `FixedToolbar`, `FindBar`,
  `CommentSidebar`, `VersionHistory`, `ThemeToggle`.
- UI strings in English and Russian: `blockEditorEn`, `blockEditorRu`, `withBlockEditorStrings`.

## License

The GoTipe Commercial License, see
[LICENSE-COMMERCIAL](https://github.com/veniameen/gotipe/blob/main/packages/block-editor/LICENSE-COMMERCIAL)
and [licensing](https://gotipe.com/docs/resources/licensing/). It is free for personal,
non-profit, educational and open-source projects, for organizations whose gross revenue was
under USD 1,000,000 in the last 12 months, and for evaluation and development; other
production use needs a commercial license per product.
