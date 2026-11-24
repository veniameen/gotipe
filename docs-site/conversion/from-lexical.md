---
title: Migrate from Lexical
description: Move a Lexical editor in production to GoTipe by converting the serialized editor state, replacing the React composer and porting nodes, commands, listeners, Markdown and collaboration.
packages: ["@gotipe/migration", "@gotipe/core", "@gotipe/react", "@gotipe/markdown"]
license: MIT
---

This guide is for teams that run Lexical in production, store its serialized editor state
(`editor.getEditorState().toJSON()`) and want to move to GoTipe. It walks through the data
first, then the code. Lexical and GoTipe model documents and updates differently, so plan the
move as a data migration plus a rewrite of the editor code.

## What moves and what does not

Moves automatically, with `@gotipe/migration`:

- Serialized Lexical state: paragraphs, headings, quotes, code blocks with their highlight tokens, bullet, numbered and check lists, tables, images, horizontal rules, line breaks and tabs.
- Text format flags (bold, italic, strikethrough, underline, code, subscript, superscript, highlight), `color` and `background-color` styles, links and autolinks, the alignment of paragraphs, headings and cells, and cell spans.

Needs your work:

- Your own `ElementNode` and `DecoratorNode` classes: you declare them as GoTipe extensions and map their types.
- Inline nodes other than text, links, line breaks and tabs, such as mentions or hashtags: GoTipe has no inline nodes, and the converter keeps such a paragraph as JSON until you rebuild it.
- Editor code: the composer and plugins, node classes, commands, listeners and Markdown setup.
- Collaboration: Yjs state is not converted. You convert a snapshot of each document and start collaborating in GoTipe from it.

Not migrated at all: undo history, selection, Yjs updates and the behaviour of plugins and
node transforms.

## Concept map

| Lexical | GoTipe | Docs |
|---|---|---|
| `createEditor({ namespace, nodes, onError })` from `lexical`, `editor.setRootElement(element)` | `await createEditor({ extensions })`, `editor.mount(element)` | [Extensions overview](/docs/extensions/overview) |
| `registerRichText`, `registerHistory` | Extensions in a preset: `DefaultPreset` has the blocks, marks and `History` | [Presets](/docs/extensions/overview#presets) |
| `LexicalComposer` with `initialConfig` | `useEditor(options)` from `@gotipe/react` | [React](/docs/frameworks/react) |
| `RichTextPlugin`, `ContentEditable`, `LexicalErrorBoundary` | `Editor` or `EditorContent`; `useEditorStatus` reports a failed creation | [Creation errors](/docs/frameworks/react#creation-errors) |
| `HistoryPlugin` | The `History` extension, in every preset | [History](/docs/concepts/transactions#history) |
| `OnChangePlugin` | The `onUpdate` option, or `editor.on("update")` | [Events](/docs/concepts/events) |
| `ListPlugin`, `LinkPlugin`, `MarkdownShortcutPlugin` | `BulletList`, `OrderedList`, `TodoList` and `Link` in `DefaultPreset`; the built-in extensions have Markdown-style input rules such as `# `, `- ` and `**text**` | [Lists](/docs/extensions/lists#keyboard-and-input-rules), [Marks](/docs/extensions/marks#input-rules) |
| `useLexicalComposerContext()` | `useEditorContext()` inside `Editor` | [React](/docs/frameworks/react#hooks) |
| `ElementNode`, `TextNode`, `DecoratorNode` subclasses | Node specs in `defineExtension({ nodes })` | [Writing extensions](/docs/concepts/extensions) |
| `createDOM()`, `updateDOM()`, `decorate()` | React views in `blockViews` | [Block views](/docs/frameworks/react#block-views) |
| Node replacement `{ replace, with }` | An extension with the same name replaces the earlier one | [Configure an extension](/docs/extensions/overview#configure-an-extension) |
| `editor.update(() => { … })` with `$` functions | `editor.dispatch({ steps })`, command chains, `editor.batch()` | [Transactions](/docs/concepts/transactions) |
| `editor.read()`, `$getRoot()`, `$getSelection()` | `editor.getJSON()`, `editor.getViewState()`, `editor.getCurrentBlock()` | [Commands](/docs/concepts/commands#reading-state) |
| `createCommand`, `registerCommand`, `dispatchCommand` | Functions that call `editor.chain()`; `keybindings` for keys | [Commands](/docs/concepts/commands) |
| `registerUpdateListener` | `editor.on("update")` | [Events](/docs/concepts/events) |
| `registerEditableListener` | `editor.on("editableChange")` | [Events](/docs/concepts/events#editor-events) |
| `getEditorState().toJSON()`, `setEditorState(parseEditorState(json))` | `editor.getJSON()`, `editor.setContent(doc)` | [Content formats](/docs/concepts/content-formats#json) |
| `$generateHtmlFromNodes`, `$generateNodesFromDOM` from `@lexical/html` | `editor.getHTML()`, `editor.setContent(html)`, `renderToHtml` | [Content formats](/docs/concepts/content-formats#html) |
| `$convertToMarkdownString`, `$convertFromMarkdownString` from `@lexical/markdown` | `editor.getMarkdown()`, `parseMarkdown` from `@gotipe/markdown` | [Markdown](/docs/conversion/markdown) |
| `createHeadlessEditor` from `@lexical/headless` | `createHeadlessEditor` from `@gotipe/core/server` | [Server rendering](/docs/concepts/content-formats#server-rendering) |
| `CollaborationPlugin`, `@lexical/yjs` | `@gotipe/collaboration` and the CRDT of the WASM engine | [Collaboration](/docs/collaboration/overview) |
| `MarkNode` from `@lexical/mark` for comment ranges | `@gotipe/comments`: threads kept next to the document | [Comments](/docs/review/comments) |

The document model differs in one way that matters everywhere: a GoTipe document is a tree of
blocks with IDs, and the text of a block is a list of spans with marks. Formatting is a list of
named marks rather than bit flags, and there are no inline nodes. See
[Document model](/docs/concepts/document-model).

| Lexical node | GoTipe |
|---|---|
| `paragraph`, `heading` (`h1`–`h6`), `quote` | `paragraph`, `heading` with `level`, `blockquote` |
| `code` with `code-highlight` children | `codeBlock` with raw text |
| `list` (`bullet`, `number`, `check`) and `listitem` | `bulletList`, `orderedList` or `todoList` with `listItem` or `todoItem` |
| `table`, `tablerow`, `tablecell` | `table`, `tableRow`, `tableCell` or `tableHeader` |
| `image`, `horizontalrule` | `image`, `divider` |
| `linebreak`, `tab` | `\n` and `\t` in the text |
| `link`, `autolink` | The `link` mark |
| `text` with `format` flags and `style` colours | Spans with `bold`, `italic`, `strikethrough`, `underline`, `code`, `subscript`, `superscript`, `highlight`, `textColor` |

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

// Your own DecoratorNode, serialized as { type: "video", videoId }; ported in step 4.
export const Video = defineExtension({
  name: "video",
  nodes: [
    {
      name: "video",
      group: ["block"],
      content: "empty",
      attrs: { videoId: { type: "string", required: true } },
      topLevel: true,
      marksAllowed: "none",
      leaf: true,
      allowsChildren: false,
    },
  ],
});

export const extensions = [...FullPreset, Mention, MarkdownRaw, Video];
```

### A batch script

This script reads one serialized editor state per file, converts it, checks it against the
schema and writes the result. It runs in Node; the converter loads no editor and no DOM.

```ts title="migrate.ts"
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Block } from "@gotipe/core";
import { createHeadlessEditor } from "@gotipe/core/server";
import { convertLexicalToGoTipe } from "@gotipe/migration";
import { rebuildPreserved } from "./rebuild";
import { extensions } from "./schema";

// The converter gives a block of your own type rich text; a type declared with content "empty" holds null.
function emptyContent(blocks: Block[], types: Set<string>): Block[] {
  return blocks.map((block) => ({
    ...block,
    content: types.has(block.type) ? null : block.content,
    children: emptyContent(block.children, types),
  }));
}

const input = "export/lexical";
const output = "export/gotipe";
await mkdir(output, { recursive: true });
const editor = await createHeadlessEditor({ extensions });

for (const name of await readdir(input)) {
  if (!name.endsWith(".json")) continue;
  const state = JSON.parse(await readFile(path.join(input, name), "utf8"));
  const result = convertLexicalToGoTipe(state, { blockTypeMap: { video: "video" } });
  for (const warning of result.warnings) console.warn(`${name}: ${warning}`);
  const ids = new Set(result.preserved.map((entry) => entry.blockId));
  const blocks = rebuildPreserved(emptyContent(result.document.blocks, new Set(["video"])), ids);
  const document = { ...result.document, blocks };
  if (!editor.validate(document)) {
    console.error(`${name}: does not fit the schema, not written`);
    continue;
  }
  await writeFile(path.join(output, name), JSON.stringify({ document, unmapped: result.unmapped }));
}
editor.destroy();
```

If your database holds the state as a string, as `JSON.stringify(editorState)` writes it, parse
it before the conversion. Run the script on a copy of production data first, read the warnings,
and keep the source data until you have checked the result on your own documents.

### Read the result

| Field | What to do with it |
|---|---|
| `result.document` | The GoTipe document. Store it in place of the editor state. |
| `result.warnings` | One message per problem, with the source path, such as `root.children[3]`: preserved subtrees, replaced IDs, fields that do not fit. Log them and review a sample. |
| `result.preserved` | Subtrees kept as JSON in a `markdownRaw` block (`kind: "json"`): `blockId`, source `path`, `sourceType` and `reason`. Each one is content to port by hand or with a mapping. |
| `result.unmapped` | Source fields that have no GoTipe attribute, such as `indent`, `direction` or an image `caption`, tied to the block by `blockId`. Defaults such as `version` or `direction: "ltr"` are listed without a warning. |

A preserved block is valid content: the editor shows it, and nothing is lost. It is not
editable as the original node, so aim for zero entries in `preserved` before the switch.

### Custom node types

`blockTypeMap` adds node types the converter does not know. It renames types; it does not
convert fields:

- A GoTipe type, such as `{ banner: "callout" }`, gets the attributes its schema declares; the other fields go to `unmapped`.
- A type of your own, such as `{ video: "video" }`, gets the node's own fields as they are, so its extension must declare them. Lexical's common fields (`format`, `indent`, `direction`, `version`) go to `unmapped`.
- `markTypeMap` renames the mark a format flag becomes, such as `{ highlight: "marker" }` for a `marker` mark of your own; Lexical has no other marks to map.

### Rebuild preserved paragraphs

A paragraph with an inline node the converter does not know, such as your own mention node, is
kept whole as JSON. Its block holds the source subtree, so you can rebuild it after the
conversion. This example assumes your mention node serializes as text with a `mentionId`:

```ts title="rebuild.ts"
import { type Block, type Mark, type TextSpan, createId } from "@gotipe/core";

type LexicalNode = { type: string; text?: string; format?: number; mentionId?: string; children?: LexicalNode[] };

const FORMATS: [number, string][] = [[1, "bold"], [2, "italic"], [4, "strikethrough"], [8, "underline"], [16, "code"]];

function paragraph(source: LexicalNode): TextSpan[] | null {
  if (source.type !== "paragraph") return null;
  const content: TextSpan[] = [];
  for (const child of source.children ?? []) {
    if (typeof child.text !== "string") return null;
    const marks: Mark[] = FORMATS.filter(([flag]) => ((child.format ?? 0) & flag) !== 0).map(([, type]) => ({
      type,
      attrs: {},
    }));
    if (child.type === "mention" && child.mentionId) {
      const label = child.text.replace(/^@/, "");
      marks.push({ type: "mention", attrs: { id: child.mentionId, label, key: createId() } });
    } else if (child.type !== "text") return null;
    content.push({ text: child.text, marks });
  }
  return content;
}

// Replaces preserved paragraphs it can read; anything else stays preserved.
export function rebuildPreserved(blocks: Block[], preserved: Set<string>): Block[] {
  return blocks.map((block) => {
    if (preserved.has(block.id) && typeof block.content === "string") {
      const content = paragraph(JSON.parse(block.content));
      if (content) return { id: block.id, type: "paragraph", attrs: {}, content, children: [] };
    }
    return { ...block, children: rebuildPreserved(block.children, preserved) };
  });
}
```

A paragraph inside a list, a quote or a table cell cannot be a raw block, so the converter keeps
the whole list, quote or table instead, and this function leaves it as it is.

### Strict mode

While you build the mappings, `strict: true` makes the converter throw `UnsupportedContent` on
the first node it cannot convert, with the source `path` and the `reason`:

```ts title="check.ts"
import { UnsupportedContent, convertLexicalToGoTipe } from "@gotipe/migration";

export function findUnsupported(state: unknown): string | null {
  try {
    convertLexicalToGoTipe(state, { strict: true, blockTypeMap: { video: "video" } });
    return null;
  } catch (error) {
    if (error instanceof UnsupportedContent) return `${error.path}: ${error.reason}`;
    throw error;
  }
}
```

The full list of converted nodes, fields, options and limits is in
[Migration](/docs/conversion/migration).

## Step 3: Replace the editor component

A minimal Lexical editor and its GoTipe counterpart:

```tsx tab="Lexical" title="NotesEditor.tsx"
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";

export function NotesEditor({ state, onSave }: { state: string; onSave: (json: string) => void }) {
  const initialConfig = {
    namespace: "notes",
    editorState: state,
    onError: (error: Error) => console.error(error),
  };
  return (
    <LexicalComposer initialConfig={initialConfig}>
      <RichTextPlugin contentEditable={<ContentEditable />} ErrorBoundary={LexicalErrorBoundary} />
      <HistoryPlugin />
      <OnChangePlugin onChange={(editorState) => onSave(JSON.stringify(editorState.toJSON()))} />
    </LexicalComposer>
  );
}
```

```tsx tab="GoTipe" title="NotesEditor.tsx"
import type { Document } from "@gotipe/core";
import { Editor, useEditorStatus } from "@gotipe/react";
import { extensions } from "./schema";

export function NotesEditor({ content, onSave }: { content: Document; onSave: (doc: Document) => void }) {
  const { editor, error } = useEditorStatus({
    extensions,
    content,
    onUpdate: ({ editor }) => onSave(editor.getJSON()),
  });
  if (error) return <p role="alert">The editor could not start: {error.message}</p>;
  return <Editor editor={editor} ariaLabel="Notes" />;
}
```

Lexical's documentation now builds editors from extensions (`LexicalExtensionComposer`); the
mapping to GoTipe is the same. Differences to know:

- There are no plugin components. Features are extensions passed to `useEditor` or `useEditorStatus`, and a preset brings history, lists, links and Markdown-style input rules.
- `useEditorStatus` returns `null` until the editor exists, and `Editor` renders nothing while it is `null`. Options are read once; to load another document, call `editor.setContent(doc)`.
- `@gotipe/react` ships no CSS and no theme object. Style `.gotipe-content` yourself, or use `BlockEditor` with `@gotipe/theme`; see [installation](/docs/getting-started/installation#styles).
- Images and files are read-only in `Editor` until you provide `@gotipe/react/media`; see [image and file editing](/docs/frameworks/react#image-and-file-editing).

For a ready editing surface with the `/` menu, the block handle and the formatting bubble, pass
the editor to `BlockEditor` from `@gotipe/block-editor`; see [Block editor](/docs/ui/block-editor).

## Step 4: Port custom nodes

Each node class becomes a node spec. The class methods map like this:

| Lexical | GoTipe |
|---|---|
| `ElementNode` with text children | `content: "richText"` (spans with marks) |
| `ElementNode` with block children | `allowsChildren: true`, and `childTypes` to limit the children |
| `DecoratorNode` | `content: "empty"`, `leaf: true`, and a React view |
| `static getType()` | `name` |
| Fields written by `exportJSON()` | `attrs`: every attribute declared with a type; undeclared ones are rejected |
| `importJSON()`, `exportJSON()` | Not needed: the document is the JSON |
| `createDOM()`, `updateDOM()`, `decorate()` | A React view in `blockViews` |
| `exportDOM()`, `importDOM()` | No per-node HTML rules; see step 6 |
| A `TextNode` subclass, such as a mention | A mark; an atomic mark for a token the caret must not enter |

The `video` decorator from step 2, drawn as a React view. A view spreads `rootProps` on its root
element:

```tsx title="VideoView.tsx"
import type { BlockViewProps } from "@gotipe/react";

export function VideoView({ block, rootProps }: BlockViewProps) {
  const className = ["video", rootProps.className].filter(Boolean).join(" ");
  const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(String(block.attrs.videoId))}`;
  return (
    <figure {...rootProps} data-block-type="video" className={className}>
      <iframe src={src} title="Video" allowFullScreen />
    </figure>
  );
}

// <Editor editor={editor} blockViews={{ video: VideoView }} />
```

For an embedded video you can also use GoTipe's `embed` block from `FullPreset` instead of a type
of your own; see [Media](/docs/extensions/media#embed).

GoTipe has no inline nodes. A mention, a hashtag or an inline formula is text with an atomic
mark: the text is the fallback, the caret never enters it, and Backspace removes it whole. The
built-in `Mention`, `InlineMath`, `CustomEmoji` and `InlineImage` extensions cover the common
cases; see [Inline atoms](/docs/extensions/inline-atoms). The React and Vue renderers draw only
the built-in marks, so a mark of your own renders unformatted; show it with an inline decoration
from a `plugin` (see [Writing extensions](/docs/concepts/extensions#plugins-and-decorations)).

## Step 5: Port commands and listeners

Lexical dispatches command objects to listeners with priorities. GoTipe commands are methods of a
chain, and `run()` dispatches the staged commands as one transaction:

| Lexical | GoTipe |
|---|---|
| `dispatchCommand(FORMAT_TEXT_COMMAND, "bold")` | `chain().focus().toggleBold().run()` |
| `INSERT_UNORDERED_LIST_COMMAND`, `INSERT_ORDERED_LIST_COMMAND`, `INSERT_CHECK_LIST_COMMAND` | `toggleBulletList()`, `toggleOrderedList()`, `toggleTodoList()` |
| `TOGGLE_LINK_COMMAND` | `setLink(href)`, `removeLink()` |
| `UNDO_COMMAND`, `REDO_COMMAND` | `undo()`, `redo()` |
| `$setBlocksType(selection, createElement)` from `@lexical/selection` | `setBlockType(type, attrs)` |
| `registerCommand(KEY_ENTER_COMMAND, listener, priority)` | A `keybindings` entry with `key: "Enter"` |
| A command of your own from `createCommand` | A function that takes the editor |

```ts title="commands.ts"
import type { GoTipeEditor } from "@gotipe/core";

export function insertVideo(editor: GoTipeEditor, videoId: string): boolean {
  return editor.chain().focus().insertBlockAfter("video", { videoId }).run();
}
```

Keybindings are tried in extension order, and the first command that does not return `false`
handles the key; there are no priorities. Code that ran inside `editor.update()` becomes a
[transaction](/docs/concepts/transactions): steps that name blocks by ID and text by UTF-16
offset, validated as a whole before anything changes. `editor.batch(fn)` makes several dispatches
one undo step.

| Lexical listener | GoTipe |
|---|---|
| `registerUpdateListener` | `editor.on("update")`, with `origin`: `"local"` or `"remote"` |
| `registerTextContentListener` | `editor.on("update")` and `editor.getText()` |
| `registerEditableListener` | `editor.on("editableChange")` |
| `registerMutationListener` | `editor.on("transaction")`, with `before` and `after` copies of the document |
| `registerNodeTransform` | No counterpart; see below |

`editor.on(event, handler)` returns the function that removes the handler. GoTipe does not run
transforms after each change. The schema is checked on every transaction, and a change that does
not fit is rejected as a whole. To shape what the user types, use input rules and paste hooks; to
refuse a change, use a [transaction filter](/docs/concepts/transactions#filters).

## Step 6: Markdown and HTML

`editor.getMarkdown()` replaces `$convertToMarkdownString(TRANSFORMERS)` and writes
GitHub-flavoured Markdown with GoTipe's own serializer. To load Markdown, parse it with
`@gotipe/markdown`:

```ts title="markdown.ts"
import type { GoTipeEditor } from "@gotipe/core";
import { parseMarkdown } from "@gotipe/markdown";

export function loadMarkdown(editor: GoTipeEditor, text: string) {
  editor.setContent(parseMarkdown(text).doc);
}
```

The parser keeps Markdown the editor cannot edit (HTML, footnotes) as `markdownRaw` blocks and
`mdRaw` text, so register both, as [Content formats](/docs/concepts/content-formats#markdown)
shows. There are no transformers to write: the mapping is fixed and listed in
[Markdown](/docs/conversion/markdown#document-mapping). If you stored Markdown rather than editor
state, you need no converter: parse the files.

`editor.getHTML()` replaces `$generateHtmlFromNodes`, and `editor.setContent(html)` replaces
`$generateNodesFromDOM`; HTML import runs in the browser only. On a server, `renderToHtml(doc)`
from `@gotipe/core/server` renders without a DOM, and its `blockRenderers` option gives your own
block types their HTML. GoTipe has no `exportDOM` or `importDOM` per node: HTML import knows the
built-in elements, and the exporters write a type they do not know as a paragraph with its text.
See [Server rendering](/docs/concepts/content-formats#server-rendering).

## Step 7: Collaboration

There is no automatic conversion of Yjs state. GoTipe does not read a Y.Doc or `@lexical/yjs`
updates, and GoTipe's own CRDT starts from a plain document. Move each shared document this way:

1. Stop edits to the document in Lexical, for example by making it read-only for the switch.
2. Take a snapshot as serialized state: `editor.getEditorState().toJSON()` from an editor connected to the document. On a server, Lexical's collaboration FAQ shows a headless editor that reads a Y.Doc with `createBinding` and `syncYjsChangesToLexical` from `@lexical/yjs`.
3. Convert the snapshot with `@gotipe/migration` as in step 2.
4. Store the result as the document's new baseline, for example with `POST /v1/documents` of GoTipe Cloud ([REST API](/docs/cloud/rest-api#create)).
5. Open it in GoTipe with `engine: "wasm"` and `@gotipe/collaboration`, as in [Connect to GoTipe Cloud](/docs/collaboration/overview#connect-to-gotipe-cloud).

Edits made in Lexical after the snapshot are not in GoTipe, so take it last. The Yjs update
history, cursors and undo stacks are not carried over. Collaboration in GoTipe needs the WASM
engine; with your own server, use the editor's collaboration methods
([Your own transport](/docs/collaboration/overview#your-own-transport)).

## What GoTipe does not have

- **Inline nodes and inline decorators.** Mentions, hashtags and inline formulas are text with atomic marks; a React component inside a line of text has no counterpart.
- **Node classes.** Nodes are declared as data; there is no subclassing of built-in nodes and no `$config()`.
- **Node transforms and mutation listeners.** Changes are checked against the schema, filtered and observed through events, not transformed after the fact.
- **A command bus with priorities.** Commands are chain methods and plain functions; keys go through keybindings in extension order.
- **Text case formats.** Lexical's lowercase, uppercase and capitalize flags have no GoTipe mark; the converter keeps such a paragraph as JSON.
- **Paragraph indentation and text direction in the converter.** `indent` and `direction` go to `unmapped`.
- **Transformers and per-node DOM rules.** Markdown and HTML know the built-in types; a type of your own is written as a paragraph with its text, except through server `blockRenderers`.
- **Rendering of custom marks.** The React and Vue renderers draw only the built-in marks.
- **Yjs interoperability.** GoTipe's CRDT is its own; `@lexical/yjs` providers do not connect to it.
- **Converter coverage for every node.** Nodes outside the table in [Migration](/docs/conversion/migration#what-is-converted) need a mapping or stay as JSON.

Lexical documents a framework-agnostic core with React bindings. GoTipe has adapters for React,
Vue 3, Svelte 5 and Solid, and `editor.mount(element)` for plain JavaScript.

## Related

- [Migration](/docs/conversion/migration): the converter's options, result and limits.
- [Document model](/docs/concepts/document-model) and [Writing extensions](/docs/concepts/extensions)
- [React](/docs/frameworks/react) and [Block editor](/docs/ui/block-editor)
- [Collaboration](/docs/collaboration/overview)
