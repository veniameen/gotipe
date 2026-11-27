---
title: Migrate from Tiptap
description: Migrate from Tiptap to GoTipe by converting stored JSON, replacing the React editor and porting custom nodes, marks, commands, Markdown and collaboration.
packages: ["@gotipe/migration", "@gotipe/core", "@gotipe/react", "@gotipe/markdown"]
license: MIT
---

This guide is for teams that run Tiptap in production, store its JSON (`editor.getJSON()`)
and want to move to GoTipe. It walks through the data first, then the code. Tiptap and GoTipe
differ in how they model a document, so plan the move as a data migration plus a rewrite of the
editor code, not as a swap of imports.

## What moves and what does not

Moves automatically, with `@gotipe/migration`:

- Stored Tiptap and ProseMirror JSON: paragraphs, headings, quotes, code blocks, bullet, ordered and task lists, tables, images, horizontal rules, hard breaks and the common marks.
- Block IDs kept in `attrs.id`, text alignment (`textAlign`), table cell spans and alignment, link targets and text colours.

Needs your work:

- Custom nodes and marks: you declare them as GoTipe extensions and map their names.
- Inline nodes such as mentions: GoTipe has no inline nodes, so a mention becomes text with an atomic mark. The converter keeps such a paragraph as JSON unless you rewrite it first.
- Editor code: the React component, menus, node views, commands, event listeners and Markdown setup.
- Collaboration: Yjs state is not converted. You convert a snapshot of each document and start collaborating in GoTipe from it.

Not migrated at all: undo history, selection, Yjs updates and awareness, and the behaviour of
ProseMirror plugins.

## Concept map

| Tiptap | GoTipe | Docs |
|---|---|---|
| `new Editor({ element, extensions, content })` from `@tiptap/core` | `await createEditor({ extensions, content })`, then `editor.mount(element)` | [Extensions overview](/docs/extensions/overview) |
| `useEditor`, `EditorContent` from `@tiptap/react` | `useEditor`, `EditorContent` or `Editor` from `@gotipe/react` | [React](/docs/frameworks/react) |
| `useEditorState` | `useEditorState(editor, selector)` | [React](/docs/frameworks/react#hooks) |
| `EditorProvider`, `useCurrentEditor` | The `Editor` component and `useEditorContext()` | [React](/docs/frameworks/react#components) |
| `BubbleMenu`, `FloatingMenu` from `@tiptap/react/menus` | `BubbleMenu`, `FloatingMenu` from `@gotipe/react`; the ready menus of `BlockEditor` | [Menus](/docs/ui/menus) |
| `StarterKit` | `DefaultPreset` or `FullPreset` from `@gotipe/core/presets` | [Presets](/docs/extensions/overview#presets) |
| `Node.create`, `Mark.create`, `Extension.create` | `defineExtension({ name, nodes, marks })` | [Writing extensions](/docs/concepts/extensions) |
| `addAttributes()` | `attrs` with an `AttrSpec` per attribute | [Attributes](/docs/concepts/extensions#attributes) |
| `addKeyboardShortcuts()`, `addInputRules()`, `addPasteRules()` | `keybindings`, `inputRules`, `pasteRules` | [Writing extensions](/docs/concepts/extensions#keyboard-shortcuts) |
| `addProseMirrorPlugins()` | `plugin`: `init`, `apply`, `decorations`, `destroy` | [Plugins and decorations](/docs/concepts/extensions#plugins-and-decorations) |
| `addNodeView()` with `ReactNodeViewRenderer` | `blockViews` of `Editor`, `EditorContent` or `BlockEditor` | [Block views](/docs/frameworks/react#block-views) |
| `addCommands()` | Functions that call `editor.chain()` or `editor.dispatch()` | [Commands](/docs/concepts/commands) |
| `editor.chain().focus().toggleBold().run()` | The same chain | [Commands](/docs/concepts/commands#run-a-chain) |
| `editor.isActive("heading", { level: 2 })` | `editor.isActive("heading", { level: 2 })` | [Reading state](/docs/concepts/commands#reading-state) |
| `editor.commands.setContent(content)` | `editor.setContent(content)` | [Content formats](/docs/concepts/content-formats#json) |
| `editor.on("update")`, `"selectionUpdate"`, `"transaction"` | `editor.on("update")`, `"selectionChange"`, `"transaction"` | [Events](/docs/concepts/events) |
| `getJSON()`, `getHTML()`, `getText()` | `getJSON()`, `getHTML()`, `getText()` | [Content formats](/docs/concepts/content-formats) |
| `generateHTML` from `@tiptap/html` | `serializeHtml` from `@gotipe/core`, `renderToHtml` from `@gotipe/core/server` | [Server rendering](/docs/concepts/content-formats#server-rendering) |
| `@tiptap/markdown`, `editor.getMarkdown()` | `editor.getMarkdown()`; `parseMarkdown` from `@gotipe/markdown` | [Markdown](/docs/conversion/markdown) |
| `@tiptap/extension-mention` | `Mention` from `@gotipe/core/extensions` (an atomic mark) | [Inline atoms](/docs/extensions/inline-atoms) |
| `@tiptap/extension-collaboration` with Yjs | `@gotipe/collaboration` and the CRDT of the WASM engine | [Collaboration](/docs/collaboration/overview) |

The document model differs in one way that matters everywhere: a GoTipe document is a tree of
blocks with IDs, and the text of a block is a list of spans with marks. There are no inline
nodes. See [Document model](/docs/concepts/document-model).

| Tiptap node or mark | GoTipe |
|---|---|
| `paragraph`, `heading`, `blockquote`, `codeBlock` | `paragraph`, `heading`, `blockquote`, `codeBlock` |
| `bulletList`, `orderedList`, `listItem` | `bulletList`, `orderedList`, `listItem` |
| `taskList`, `taskItem` | `todoList`, `todoItem` |
| `table`, `tableRow`, `tableCell`, `tableHeader` | The same names |
| `image`, `horizontalRule`, `hardBreak` | `image`, `divider`, a `\n` in the text |
| `bold`, `italic`, `underline`, `strike`, `code`, `link` | `bold`, `italic`, `underline`, `strikethrough`, `code`, `link` |
| `highlight`, `subscript`, `superscript`, `textStyle` colour | `highlight`, `subscript`, `superscript`, `textColor` |

## Step 1: Install GoTipe

```sh
npm install @gotipe/core @gotipe/react @gotipe/markdown @gotipe/migration react react-dom
```

`@gotipe/migration` is needed only by the conversion script. For the ready editor UI with the
`/` menu and block handle, add the commercial `@gotipe/block-editor`; see
[installation](/docs/getting-started/installation). For collaboration, add `@gotipe/wasm` and
`@gotipe/collaboration` (step 7).

## Step 2: Convert stored documents

Put the schema in one module and use it in both the script and the editor, so that a document
the script accepts is one the editor accepts:

```ts title="schema.ts"
import { defineExtension } from "@gotipe/core";
import { Mention } from "@gotipe/core/extensions";
import { FullPreset } from "@gotipe/core/presets";
import { markdownRawNodeSpec } from "@gotipe/markdown";

// Holds source content the converter could not represent, as its JSON.
export const MarkdownRaw = defineExtension({ name: "markdownRaw", nodes: [markdownRawNodeSpec] });

// A custom Tiptap node, ported in step 4.
export const Notice = defineExtension({
  name: "notice",
  nodes: [
    {
      name: "notice",
      group: ["block"],
      content: "richText",
      attrs: { tone: { type: "enum", values: ["info", "warning"], default: "info" } },
      topLevel: true,
      marksAllowed: "all",
      leaf: false,
      allowsChildren: false,
    },
  ],
});

export const extensions = [...FullPreset, Mention, MarkdownRaw, Notice];
```

### A batch script

This script reads one Tiptap JSON file per document, converts it, checks it against the schema
and writes the result. It runs in Node; the converter loads no editor and no DOM.

```ts title="migrate.ts"
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createId } from "@gotipe/core";
import { createHeadlessEditor } from "@gotipe/core/server";
import { convertProseMirrorToGoTipe } from "@gotipe/migration";
import { extensions } from "./schema";

type TiptapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  [key: string]: unknown;
};

// GoTipe has no inline nodes: a mention becomes text with the atomic `mention` mark.
function mentionsToMarks(node: TiptapNode): TiptapNode {
  if (node.type === "mention") {
    const id = String(node.attrs?.id ?? "");
    const label = String(node.attrs?.label ?? id);
    return {
      type: "text",
      text: `@${label}`,
      marks: [{ type: "mention", attrs: { id, label, key: createId() } }],
    };
  }
  return node.content ? { ...node, content: node.content.map(mentionsToMarks) } : node;
}

const input = "export/tiptap";
const output = "export/gotipe";
await mkdir(output, { recursive: true });
const editor = await createHeadlessEditor({ extensions });

for (const name of await readdir(input)) {
  if (!name.endsWith(".json")) continue;
  const source: TiptapNode = JSON.parse(await readFile(path.join(input, name), "utf8"));
  const result = convertProseMirrorToGoTipe(mentionsToMarks(source), {
    blockTypeMap: { notice: "notice" },
    markTypeMap: { mention: "mention" },
  });
  for (const warning of result.warnings) console.warn(`${name}: ${warning}`);
  if (!editor.validate(result.document)) {
    console.error(`${name}: does not fit the schema, not written`);
    continue;
  }
  const record = { document: result.document, unmapped: result.unmapped, preserved: result.preserved };
  await writeFile(path.join(output, name), JSON.stringify(record));
}
editor.destroy();
```

Run it on a copy of production data first, read the warnings, and keep the source data until
you have checked the result on your own documents. The converter rejects values that are not
JSON, such as `undefined`, so leave a field out of your own rewrites instead of setting it to
`undefined`.

### Read the result

| Field | What to do with it |
|---|---|
| `result.document` | The GoTipe document. Store it in place of the Tiptap JSON. |
| `result.warnings` | One message per problem, with the source path: preserved subtrees, replaced IDs, fields that do not fit. Log them and review a sample. |
| `result.preserved` | Subtrees kept as JSON in a `markdownRaw` block (`kind: "json"`): `blockId`, source `path`, `sourceType` and `reason`. Each one is content to port by hand or with a mapping. |
| `result.unmapped` | Source fields that have no GoTipe attribute, such as `colwidth` of a table cell or an image `title`, tied to the block by `blockId`. Store them if you may need them later. |

A preserved block is valid content: the editor shows it, and nothing is lost. It is not
editable as the original node, so aim for zero entries in `preserved` before the switch.

### Custom node and mark types

`blockTypeMap` and `markTypeMap` add names the converter does not know. They rename types; they
do not convert attributes:

- A GoTipe type, such as `{ alert: "callout" }`, gets the attributes its schema declares; the other source attributes go to `unmapped`.
- A type of your own, such as `{ notice: "notice" }`, gets the source attributes as they are, so its extension must declare them.
- Inline nodes need a rewrite before the conversion, as `mentionsToMarks` does above: GoTipe holds them as text with a mark.

### Strict mode

While you build the mappings, `strict: true` makes the converter throw `UnsupportedContent` on
the first node or mark it cannot convert, with the source `path` and the `reason`:

```ts title="check.ts"
import { UnsupportedContent, convertProseMirrorToGoTipe } from "@gotipe/migration";

export function findUnsupported(source: unknown): string | null {
  try {
    convertProseMirrorToGoTipe(source, { strict: true, blockTypeMap: { notice: "notice" } });
    return null;
  } catch (error) {
    if (error instanceof UnsupportedContent) return `${error.path}: ${error.reason}`;
    throw error;
  }
}
```

The full list of converted nodes, attributes, options and limits is in
[Migration](/docs/conversion/migration).

## Step 3: Replace the editor component

A minimal Tiptap editor and its GoTipe counterpart:

```tsx tab="Tiptap" title="NotesEditor.tsx"
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

export function NotesEditor({ content, onSave }: { content: object; onSave: (json: object) => void }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content,
    onUpdate: ({ editor }) => onSave(editor.getJSON()),
  });
  return <EditorContent editor={editor} />;
}
```

```tsx tab="GoTipe" title="NotesEditor.tsx"
import type { Document } from "@gotipe/core";
import { Editor, useEditor } from "@gotipe/react";
import { extensions } from "./schema";

export function NotesEditor({ content, onSave }: { content: Document; onSave: (doc: Document) => void }) {
  const editor = useEditor({
    extensions,
    content,
    onUpdate: ({ editor }) => onSave(editor.getJSON()),
  });
  return <Editor editor={editor} ariaLabel="Notes" />;
}
```

Differences to know:

- `useEditor` returns `null` until the editor exists, and `Editor` renders nothing while it is `null`. Options are read once; to load another document, call `editor.setContent(doc)`.
- `@gotipe/react` ships no CSS. Style `.gotipe-content` yourself, or use `BlockEditor` with `@gotipe/theme`; see [installation](/docs/getting-started/installation#styles).
- Images and files are read-only in `Editor` until you provide `@gotipe/react/media`; see [image and file editing](/docs/frameworks/react#image-and-file-editing).
- A toolbar button keeps the selection when it cancels `mousedown` and starts its chain with `focus()`; see [buttons and focus](/docs/concepts/commands#buttons-and-focus).

For a ready editing surface, replace your menus with `BlockEditor`:

```tsx title="NotesPage.tsx"
import { BlockEditor } from "@gotipe/block-editor";
import type { Document } from "@gotipe/core";
import { useEditor } from "@gotipe/react";
import "@gotipe/theme/base.css";
import "@gotipe/theme/theme.css";
import { extensions } from "./schema";

export function NotesPage({ content }: { content: Document }) {
  const editor = useEditor({ extensions, content });
  return <BlockEditor editor={editor} showAiCommandBar={false} />;
}
```

## Step 4: Port custom nodes and marks

A Tiptap node and the GoTipe extension that replaces it:

```ts tab="Tiptap" title="notice.ts"
import { Node } from "@tiptap/core";

export const Notice = Node.create({
  name: "notice",
  group: "block",
  content: "inline*",
  addAttributes() {
    return { tone: { default: "info" } };
  },
  parseHTML() {
    return [{ tag: "div[data-notice]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", { "data-notice": "", ...HTMLAttributes }, 0];
  },
});
```

```ts tab="GoTipe" title="notice.ts"
import { defineExtension } from "@gotipe/core";

export const Notice = defineExtension({
  name: "notice",
  nodes: [
    {
      name: "notice",
      group: ["block"],
      content: "richText",
      attrs: { tone: { type: "enum", values: ["info", "warning"], default: "info" } },
      topLevel: true,
      marksAllowed: "all",
      leaf: false,
      allowsChildren: false,
    },
  ],
});
```

How the parts of a Tiptap node map:

| Tiptap | GoTipe |
|---|---|
| `content: "inline*"` | `content: "richText"` (spans with marks) |
| `content: "text*"` without marks | `content: "rawText"` (a string) |
| A leaf or atom node | `content: "empty"`, `leaf: true` |
| `content: "block+"` | `allowsChildren: true`, and `childTypes` to limit the children |
| `group: "block"` and a place in the doc | `group: ["block"]` and `topLevel: true` |
| `addAttributes()` | `attrs`: every attribute declared with a type; undeclared ones are rejected |
| `parseHTML()`, `renderHTML()` | No per-node HTML rules; see step 6 |
| `addNodeView()` | A React view in `blockViews` |

The view of a block type is a React component that spreads `rootProps` on its root:

```tsx title="NoticeView.tsx"
import type { BlockViewProps } from "@gotipe/react";

export function NoticeView({ block, rootProps, content }: BlockViewProps) {
  const className = ["notice", rootProps.className].filter(Boolean).join(" ");
  return (
    <aside {...rootProps} data-block-type="notice" data-tone={String(block.attrs.tone ?? "info")} className={className}>
      {content}
    </aside>
  );
}

// <Editor editor={editor} blockViews={{ notice: NoticeView }} />
```

A custom mark is a `MarkSpec` in `marks`. The React and Vue renderers draw only the built-in
marks, so text with your own mark renders unformatted; show it with an inline decoration from a
`plugin` (see [Writing extensions](/docs/concepts/extensions#plugins-and-decorations)). An inline
node, such as a mention or a tag, becomes a mark with `atomic: true`: the text is the atom's
fallback and the caret never enters it. See [Inline atoms](/docs/extensions/inline-atoms).

Keyboard shortcuts, input rules and paste rules move to `keybindings`, `inputRules` and
`pasteRules` of the same extension. An input rule is tested against the whole text of the block,
not only the text before the caret; see [input rules](/docs/concepts/extensions#input-rules).

## Step 5: Port commands and events

Chains look the same. Some built-in commands have other names:

| Tiptap | GoTipe |
|---|---|
| `toggleBold()` | `toggleBold()` |
| `toggleHeading({ level: 2 })` | `setBlockType("heading", { level: 2 })` |
| `toggleBulletList()` | `toggleBulletList()` |
| `setLink({ href })` | `setLink(href)` |
| `undo()`, `redo()` | `undo()`, `redo()` |
| `editor.can().toggleBold()` | No dry run; `getViewState().toolbar` has `canUndo`, `canRedo` and `activeMarks`, and `run()` returns `false` when nothing was staged |

A command from `addCommands()` becomes a function that takes the editor:

```ts title="commands.ts"
import type { GoTipeEditor } from "@gotipe/core";

export function insertNotice(editor: GoTipeEditor, tone: "info" | "warning" = "info"): boolean {
  return editor.chain().focus().insertBlockAfter("notice", { tone }).run();
}
```

Edits that no command covers are [transactions](/docs/concepts/transactions): steps that name
blocks by ID and text by UTF-16 offset, validated as a whole before anything changes.

| Tiptap event | GoTipe event |
|---|---|
| `create`, `destroy` | `create`, `destroy` |
| `update` | `update`, with `origin`: `"local"` or `"remote"` |
| `selectionUpdate` | `selectionChange` |
| `transaction` | `transaction`, with `transaction`, `before` and `after` |
| `focus`, `blur` | `focus`, `blur` |
| `contentError` | `VALIDATION_ERROR` from `createEditor` or `setContent`; `useEditorStatus` returns it in React |
| `paste`, `drop` | Paste rules and the `transformPastedText` and `parsePastedText` hooks |

`editor.on(event, handler)` returns the function that removes the handler.

## Step 6: Markdown and HTML

`editor.getMarkdown()` writes GitHub-flavoured Markdown, as with `@tiptap/markdown`. To load
Markdown, parse it with `@gotipe/markdown` instead of passing `contentType: "markdown"`:

```ts title="markdown.ts"
import type { GoTipeEditor } from "@gotipe/core";
import { parseMarkdown } from "@gotipe/markdown";

export function loadMarkdown(editor: GoTipeEditor, text: string) {
  editor.setContent(parseMarkdown(text).doc);
}
```

The parser keeps Markdown the editor cannot edit (HTML, footnotes) as `markdownRaw` blocks and
`mdRaw` text, so register both, as [Content formats](/docs/concepts/content-formats#markdown)
shows. If you stored Markdown rather than JSON, you need no converter: parse the files. For files
that people also edit, [Markdown](/docs/conversion/markdown) keeps untouched blocks byte for byte.

`editor.getHTML()` works as in Tiptap, and `editor.setContent(html)` replaces
`editor.commands.setContent(html)`; HTML import runs in the browser only. On a server, `renderToHtml(doc)` from `@gotipe/core/server` replaces
`generateHTML`. GoTipe has no `parseHTML` or `renderHTML` per node: HTML import knows the
built-in elements, including Tiptap's `data-type="taskItem"`, and the exporters write a block
type they do not know as a paragraph with its text. On a server, `blockRenderers` gives your own
types their HTML:

```ts title="render.ts"
import type { Document } from "@gotipe/core";
import { renderToHtml } from "@gotipe/core/server";

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function toHtml(doc: Document): Promise<string> {
  return renderToHtml(doc, {
    blockRenderers: {
      notice: (block) => {
        const text = Array.isArray(block.content) ? block.content.map((span) => span.text).join("") : "";
        return `<div data-notice="${escapeHtml(String(block.attrs.tone ?? "info"))}">${escapeHtml(text)}</div>`;
      },
    },
  });
}
```

Converting stored HTML with `setContent(html)` also works, but HTML carries no block IDs and
drops attributes it has no element for; convert the JSON when you have it.

## Step 7: Collaboration

There is no automatic conversion of Yjs state. GoTipe does not read a Y.Doc, y-prosemirror
updates or a Hocuspocus database, and GoTipe's own CRDT starts from a plain document. Move each
shared document this way:

1. Stop edits to the document in Tiptap, for example by making it read-only for the switch.
2. Take a snapshot as JSON: `editor.getJSON()` from an editor connected to the document, or on a Hocuspocus server, `TiptapTransformer.fromYdoc` from `@hocuspocus/transformer`.
3. Convert the snapshot with `@gotipe/migration` as in step 2.
4. Store the result as the document's new baseline, for example with `POST /v1/documents` of GoTipe Cloud ([REST API](/docs/cloud/rest-api#create)).
5. Open it in GoTipe with `engine: "wasm"` and `@gotipe/collaboration`, as in [Connect to GoTipe Cloud](/docs/collaboration/overview#connect-to-gotipe-cloud).

Edits made in Tiptap after the snapshot are not in GoTipe, so take it last. The Yjs update
history, awareness and Tiptap's undo stacks are not carried over. Collaboration in GoTipe needs
the WASM engine; with your own server, use the editor's collaboration methods
([Your own transport](/docs/collaboration/overview#your-own-transport)).

## What GoTipe does not have

- **Inline nodes.** Mentions, inline images and inline formulas are text with atomic marks. A custom inline node with its own content model has no counterpart.
- **ProseMirror access.** There is no ProseMirror state, view, schema expression or plugin API; extensions use GoTipe's `plugin` hooks and decorations.
- **Schema content expressions.** A node declares one of three content kinds (`richText`, `rawText`, `empty`) and, for children, `childTypes`.
- **Per-node HTML and Markdown rules.** HTML and Markdown know the built-in types; a type of your own is written as a paragraph with its text, except through server `blockRenderers`.
- **Rendering of custom marks.** The React and Vue renderers draw only the built-in marks.
- **A dry run of commands** like `editor.can()`.
- **Yjs interoperability.** GoTipe's CRDT is its own; Yjs providers, Hocuspocus and y-prosemirror do not connect to it.
- **Some framework integrations.** Tiptap documents vanilla JavaScript, React, Next, Vue 2 and 3, Nuxt, Svelte, Alpine.js and PHP. GoTipe has adapters for React, Vue 3, Svelte 5 and Solid, and `editor.mount(element)` for plain JavaScript.
- **Converter coverage for every extension.** Nodes outside the table in [Migration](/docs/conversion/migration#what-is-converted) need a mapping or stay as JSON.

## Related

- [Migration](/docs/conversion/migration): the converter's options, result and limits.
- [Document model](/docs/concepts/document-model) and [Writing extensions](/docs/concepts/extensions)
- [React](/docs/frameworks/react) and [Block editor](/docs/ui/block-editor)
- [Collaboration](/docs/collaboration/overview)
