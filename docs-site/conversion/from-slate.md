---
title: Migrate from Slate and Plate
description: Migrate from Slate or Plate to GoTipe by mapping stored values, elements and leaves, replacing the React editor and porting transforms and collaboration.
packages: ["@gotipe/migration", "@gotipe/core", "@gotipe/react", "@gotipe/markdown"]
license: MIT
---

This guide is for teams that run Slate, or Plate on top of Slate, in production, store the
editor value as JSON and want to move to GoTipe. It walks through the data first, then the code.
Slate lets every application define its own schema, so the data step depends on the element
names you use; the guide shows the names Slate's examples use and a rewrite for Plate's.

## What moves and what does not

Moves automatically, with `@gotipe/migration`:

- Elements with the names of Slate's examples: paragraphs, `heading-one` to `heading-six` or `heading` with `level`, `block-quote`, `code-block`, bulleted, numbered and check lists, tables, images with `url`, horizontal rules, and links with `url` or `href`.
- Text leaves with `bold`, `italic`, `underline`, `strikethrough`, `code`, `subscript`, `superscript`, `highlight` and `color`, element `id`s and `align`.

Needs your work:

- Element names of your own schema: you map them, or declare your own types as GoTipe extensions.
- Plate values: Plate names its elements differently and keeps lists as flat blocks, so you rewrite the value into the names the converter knows first (see [Plate values](#plate-values)).
- Inline elements such as mentions: GoTipe has no inline nodes, so a mention becomes text with an atomic mark.
- Editor code: the `Slate` and `Editable` components, `renderElement`, `renderLeaf`, plugins, transforms and serializers.
- Collaboration: Yjs state is not converted. You convert a snapshot of each document and start collaborating in GoTipe from it.

Not migrated at all: undo history, selection, operations, Yjs updates and the behaviour of
plugins and `normalizeNode`.

## Concept map

| Slate | GoTipe | Docs |
|---|---|---|
| `withHistory(withReact(createEditor()))` | `useEditor({ extensions })`; `History` is in every preset | [React](/docs/frameworks/react) |
| `<Slate editor initialValue>` | The `content` option of `useEditor` | [Quick start](/docs/getting-started/quick-start#editor-options) |
| `onChange`, `onValueChange`, `onSelectionChange` | `onUpdate`, `onSelectionChange`, or `editor.on()` | [Events](/docs/concepts/events) |
| `<Editable>` | `Editor` or `EditorContent` from `@gotipe/react` | [Components](/docs/frameworks/react#components) |
| `renderElement` with `RenderElementProps` | `blockViews` with `BlockViewProps` | [Block views](/docs/frameworks/react#block-views) |
| `renderLeaf` | The renderer draws the built-in marks; decorations for the rest | [Plugins and decorations](/docs/concepts/extensions#plugins-and-decorations) |
| `placeholder`, `readOnly` of `Editable` | `Placeholder` extension, `editable: false` or `editor.setEditable(false)` | [Behaviours](/docs/extensions/behaviors#placeholder) |
| `useSlate`, `useSlateStatic` | `useEditorContext()`, `useEditorState(editor, selector)` | [Hooks](/docs/frameworks/react#hooks) |
| `useSelected`, `useFocused`, `useReadOnly` | `isSelected`, `readOnly` props of a block view; `focus` and `blur` events | [Block views](/docs/frameworks/react#block-views) |
| `Transforms.insertNodes`, `setNodes`, `wrapNodes`, `unwrapNodes` | Steps `insertBlock`, `setBlockAttrs`, `setBlockType`; list commands | [Transactions](/docs/concepts/transactions#steps) |
| `Transforms.select`, `Transforms.insertText` | `setSelection()`, `insertText(text)` | [Commands](/docs/concepts/commands) |
| `Editor.addMark`, `Editor.removeMark` | `addMark(type, from?, to?, attrs?)`, `removeMark(type)`, `toggleMark(type)` | [Marks](/docs/concepts/commands#marks) |
| `Editor.marks(editor)` | `editor.getViewState().toolbar.activeMarks` | [Reading state](/docs/concepts/commands#reading-state) |
| `editor.undo()`, `editor.redo()` | `editor.undo()`, `editor.redo()` | [History](/docs/concepts/transactions#history) |
| Plugins `withX(editor)` | Extensions from `defineExtension` | [Writing extensions](/docs/concepts/extensions) |
| `editor.isInline`, `editor.isVoid` | `content: "empty"` blocks; atomic marks for inline tokens | [Inline atoms](/docs/extensions/inline-atoms) |
| `normalizeNode` | The schema validates every transaction | [Document model](/docs/concepts/document-model#validation) |
| `editor.onChange`, `editor.operations` | The `transaction` event with `transaction`, `before` and `after` | [Events](/docs/concepts/events) |
| A `serialize` function of your own | `getHTML()`, `getMarkdown()`, `getText()`, `renderToHtml` | [Content formats](/docs/concepts/content-formats) |
| `@slate-yjs/core` | `@gotipe/collaboration` and the CRDT of the WASM engine | [Collaboration](/docs/collaboration/overview) |

Plate builds on Slate and adds its own API:

| Plate | GoTipe |
|---|---|
| `usePlateEditor({ plugins, value })`, `<Plate>`, `<PlateContent />` | `useEditor({ extensions, content })`, `Editor` |
| `createPlatePlugin`, `createSlatePlugin` | `defineExtension` |
| `BoldPlugin` and the other plugins of `@platejs/basic-nodes` | `DefaultPreset` or `FullPreset` from `@gotipe/core/presets` |
| `editor.tf.toggleMark("bold")`, `editor.tf.toggleBlock(type)` | `toggleBold()` or `toggleMark("bold")`, `setBlockType(type)` |
| `editor.tf.setValue(value)` | `editor.setContent(doc)` |
| `editor.api.markdown.serialize()`, `deserialize(md)` | `editor.getMarkdown()`, `parseMarkdown(md)` |
| `serializeHtml(editor)` from `platejs/static` | `renderToHtml(doc)` from `@gotipe/core/server` |
| `YjsPlugin` from `@platejs/yjs` | `@gotipe/collaboration` |

The document model differs in one way that matters everywhere: a GoTipe document is a tree of
blocks with IDs, declared by a schema, and the text of a block is a list of spans with marks.
There are no inline elements, and an element field the schema does not declare is rejected. See
[Document model](/docs/concepts/document-model).

| Slate element or leaf | GoTipe |
|---|---|
| `paragraph`, an element without a type | `paragraph` |
| `heading-one` … `heading-six`, `heading` with `level` | `heading` with `level` |
| `block-quote`, `code-block` | `blockquote`, `codeBlock` |
| `bulleted-list`, `numbered-list`, `list-item` | `bulletList`, `orderedList`, `listItem` |
| `check-list`, `check-list-item` | `todoList`, `todoItem` with `checked` |
| `table`, `table-row`, `table-cell`, `table-header` | `table`, `tableRow`, `tableCell`, `tableHeader` |
| `image` with `url`, `horizontal-rule` | `image` with `src`, `divider` |
| `link` with `url` or `href` | The `link` mark |
| `{ text, bold: true }` and the other leaf properties | Spans with `bold`, `italic`, `underline`, `strikethrough`, `code`, `subscript`, `superscript`, `highlight`, `textColor` |

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

export const extensions = [...FullPreset, Mention, MarkdownRaw];
```

### A batch script

This script reads one Slate value per file, converts it, checks it against the schema and writes
the result. It runs in Node; the converter loads no editor and no DOM. The value is the array
that `onChange` gives you and that Slate's "Saving to a Database" walkthrough stores with
`JSON.stringify`.

```ts title="migrate.ts"
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createId } from "@gotipe/core";
import { createHeadlessEditor } from "@gotipe/core/server";
import { convertSlateToGoTipe } from "@gotipe/migration";
import { extensions } from "./schema";

type SlateNode = { type?: string; text?: string; children?: SlateNode[]; [key: string]: unknown };

// GoTipe has no inline nodes: a mention element becomes a leaf that markTypeMap turns into a mark.
function mentionsToLeaves(node: SlateNode): SlateNode {
  if (node.type === "mention") {
    const label = String(node.character ?? "");
    return { text: `@${label}`, mention: { id: label, label, key: createId() } };
  }
  return node.children ? { ...node, children: node.children.map(mentionsToLeaves) } : node;
}

const input = "export/slate";
const output = "export/gotipe";
await mkdir(output, { recursive: true });
const editor = await createHeadlessEditor({ extensions });

for (const name of await readdir(input)) {
  if (!name.endsWith(".json")) continue;
  const value: SlateNode[] = JSON.parse(await readFile(path.join(input, name), "utf8"));
  const result = convertSlateToGoTipe(value.map(mentionsToLeaves), {
    blockTypeMap: { code: "codeBlock", quote: "blockquote" },
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

Here `code` and `quote` are the names Slate's walkthroughs use, and `character` is the field of
the mention in Slate's mentions example; replace them with the names of your schema. Run the
script on a copy of production data first, read the warnings, and keep the source data until you
have checked the result on your own documents. The converter rejects values that are not JSON,
such as `undefined`, so leave a field out of your own rewrites instead of setting it to
`undefined`.

### Read the result

| Field | What to do with it |
|---|---|
| `result.document` | The GoTipe document. Store it in place of the Slate value. |
| `result.warnings` | One message per problem, with the source path, such as `[3].children[0]`: preserved subtrees, replaced IDs, fields that do not fit. Log them and review a sample. |
| `result.preserved` | Subtrees kept as JSON in a `markdownRaw` block (`kind: "json"`): `blockId`, source `path`, `sourceType` and `reason`. Each one is content to port by hand or with a mapping. |
| `result.unmapped` | Element fields that have no GoTipe attribute, tied to the block by `blockId`. Store them if you may need them later. |

A preserved block is valid content: the editor shows it, and nothing is lost. It is not
editable as the original element, so aim for zero entries in `preserved` before the switch.

### Custom element and leaf types

`blockTypeMap` and `markTypeMap` add names the converter does not know. They rename types; they
do not convert fields:

- A GoTipe type, such as `{ code: "codeBlock" }`, gets the attributes its schema declares; the other element fields go to `unmapped`.
- A type of your own gets the element's fields as they are, so its extension must declare them. The converter gives it rich text; for a void element declared with `content: "empty"`, set `content` to `null` before validating.
- `markTypeMap` maps a leaf property to a mark. `true` gives a mark without attributes, an object gives its attributes, and a string gives the `color` of `textColor` or `highlight`.
- An inline element needs a rewrite before the conversion, as `mentionsToLeaves` does above.

### Strict mode

While you build the mappings, `strict: true` makes the converter throw `UnsupportedContent` on
the first element or leaf property it cannot convert, with the source `path` and the `reason`:

```ts title="check.ts"
import { UnsupportedContent, convertSlateToGoTipe } from "@gotipe/migration";

export function findUnsupported(value: unknown): string | null {
  try {
    convertSlateToGoTipe(value, { strict: true, blockTypeMap: { code: "codeBlock" } });
    return null;
  } catch (error) {
    if (error instanceof UnsupportedContent) return `${error.path}: ${error.reason}`;
    throw error;
  }
}
```

The full list of converted elements, fields, options and limits is in
[Migration](/docs/conversion/migration).

### Plate values

A Plate value is a Slate value with Plate's element names: `p`, `h1` to `h6`, `blockquote`, `a`,
`img`, `hr`, `code_block` with `code_line` children, `table`, `tr`, `td` and `th`. Plate's list
plugin keeps list items as flat blocks with `listStyleType` and `indent` instead of nested lists.
This rewrite turns such a value into the names the converter knows, nests the lists and turns
mentions into leaves:

```ts title="plate-to-slate.ts"
import { createId } from "@gotipe/core";

type PlateNode = { type?: string; text?: string; children?: PlateNode[]; [key: string]: unknown };

const HEADINGS: Record<string, number> = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 };
const NUMBERED = new Set(["decimal", "lower-alpha", "upper-alpha", "lower-roman", "upper-roman"]);

function element(node: PlateNode): PlateNode {
  if (typeof node.text === "string") return node;
  const { type = "", children = [], ...rest } = node;
  if (type in HEADINGS) return { ...rest, type: "heading", level: HEADINGS[type], children: blocks(children) };
  if (type === "a") return { ...rest, type: "link", children: blocks(children) };
  if (type === "mention") {
    const label = String(rest.value ?? "");
    return { text: `@${label}`, mention: { id: label, label, key: createId() } };
  }
  if (type === "code_block") {
    const { lang, ...attrs } = rest;
    const lines = children.map((line) => (line.children ?? []).map((leaf) => leaf.text ?? "").join(""));
    if (typeof lang === "string") attrs.language = lang;
    return { ...attrs, type: "code-block", children: [{ text: lines.join("\n") }] };
  }
  if (type === "td" || type === "th") {
    const { colSpan, rowSpan, ...attrs } = rest;
    if (typeof colSpan === "number") attrs.colspan = colSpan;
    if (typeof rowSpan === "number") attrs.rowspan = rowSpan;
    return { ...attrs, type, children: blocks(children) };
  }
  return { ...rest, type, children: blocks(children) };
}

// Nests the flat list blocks of Plate's list plugin by their `indent`.
function blocks(nodes: PlateNode[]): PlateNode[] {
  const out: PlateNode[] = [];
  const open: { depth: number; style: string; list: PlateNode }[] = [];
  for (const node of nodes) {
    const { listStyleType, indent, listStart, checked, ...block } = node;
    if (typeof listStyleType !== "string") {
      open.length = 0;
      out.push(element(node));
      continue;
    }
    const depth = typeof indent === "number" ? indent : 1;
    while (open.length && open[open.length - 1].depth > depth) open.pop();
    const top = open[open.length - 1];
    if (top && top.depth === depth && top.style !== listStyleType) open.pop();
    const todo = listStyleType === "todo";
    const item: PlateNode = {
      type: todo ? "check-list-item" : "list-item",
      ...(todo ? { checked: checked === true } : {}),
      children: [element(block)],
    };
    const current = open[open.length - 1];
    if (current && current.depth === depth) {
      current.list.children?.push(item);
      continue;
    }
    const list: PlateNode = {
      type: todo ? "check-list" : NUMBERED.has(listStyleType) ? "numbered-list" : "bulleted-list",
      ...(typeof listStart === "number" ? { start: listStart } : {}),
      children: [item],
    };
    if (current) current.list.children?.at(-1)?.children?.push(list);
    else out.push(list);
    open.push({ depth, style: listStyleType, list });
  }
  return out;
}

export function plateToSlate(value: PlateNode[]): PlateNode[] {
  return blocks(value);
}
```

Then convert with the remaining names in the maps:

```ts title="convert-plate.ts"
import { convertSlateToGoTipe } from "@gotipe/migration";
import { plateToSlate } from "./plate-to-slate";

export function convertPlate(value: Parameters<typeof plateToSlate>[0]) {
  return convertSlateToGoTipe(plateToSlate(value), {
    blockTypeMap: {
      p: "paragraph",
      blockquote: "blockquote",
      img: "image",
      hr: "divider",
      table: "table",
      tr: "tableRow",
      td: "tableCell",
      th: "tableHeader",
    },
    markTypeMap: { backgroundColor: "highlight", mention: "mention" },
  });
}
```

Paths in the warnings refer to the rewritten value. What else to expect from a Plate value:

- Plate's classic list plugin (`ul`, `ol`, `li`, `lic`) needs no rewrite: map `ul` to `bulletList`, `ol` to `orderedList`, `li` to `listItem` and `lic` to `paragraph`.
- `align` on paragraphs and headings is kept when it is `left`, `center`, `right` or `justify`; `start` and `end` go to `unmapped`, as do `indent` outside lists, a table's `colSizes` and an image's `caption`.
- Leaves with `fontSize`, `fontFamily` or `kbd` have no GoTipe mark: their paragraph is kept as JSON unless you map or remove those properties in the rewrite.
- Callouts, toggles, columns, equations and other Plate elements are kept as JSON unless you map them.

## Step 3: Replace the editor component

A minimal Slate editor and its GoTipe counterpart:

```tsx tab="Slate" title="NotesEditor.tsx"
import { useState } from "react";
import { type Descendant, createEditor } from "slate";
import { withHistory } from "slate-history";
import { Editable, Slate, withReact } from "slate-react";

export function NotesEditor({ value, onSave }: { value: Descendant[]; onSave: (value: Descendant[]) => void }) {
  const [editor] = useState(() => withHistory(withReact(createEditor())));
  return (
    <Slate editor={editor} initialValue={value} onValueChange={onSave}>
      <Editable placeholder="Write something" />
    </Slate>
  );
}
```

```tsx tab="GoTipe" title="NotesEditor.tsx"
import type { Document } from "@gotipe/core";
import { Placeholder } from "@gotipe/core/extensions";
import { Editor, useEditor } from "@gotipe/react";
import { extensions } from "./schema";

export function NotesEditor({ content, onSave }: { content: Document; onSave: (doc: Document) => void }) {
  const editor = useEditor({
    extensions: [...extensions, Placeholder.configure({ text: "Write something" })],
    content,
    onUpdate: ({ editor }) => onSave(editor.getJSON()),
  });
  return <Editor editor={editor} ariaLabel="Notes" />;
}
```

With Plate, `usePlateEditor`, `<Plate>` and `<PlateContent />` are replaced the same way.
Differences to know:

- There is no `renderElement` switch and no `renderLeaf`. The renderer draws every built-in block and mark; you give views only for the block types you want to draw yourself.
- `useEditor` returns `null` until the editor exists, and `Editor` renders nothing while it is `null`. Options are read once; to load another document, call `editor.setContent(doc)`.
- `@gotipe/react` ships no CSS. Style `.gotipe-content` yourself, or use `BlockEditor` with `@gotipe/theme`; see [installation](/docs/getting-started/installation#styles).
- Images and files are read-only in `Editor` until you provide `@gotipe/react/media`; see [image and file editing](/docs/frameworks/react#image-and-file-editing).

For a ready editing surface with the `/` menu, the block handle and the formatting bubble, pass
the editor to `BlockEditor` from `@gotipe/block-editor`; see [Block editor](/docs/ui/block-editor).

## Step 4: Port custom elements and leaves

Each element type of your schema becomes a node spec, and its `renderElement` branch becomes a
block view:

```ts title="notice.ts"
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

```tsx title="NoticeView.tsx"
import type { BlockViewProps } from "@gotipe/react";

// Was: case "notice": return <aside {...attributes}>{children}</aside>; in renderElement.
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

Add `Notice` to the extensions of `schema.ts` and `{ notice: "notice" }` to `blockTypeMap`.

| Slate | GoTipe |
|---|---|
| An element whose children are text | `content: "richText"` |
| An element whose children are elements | `allowsChildren: true`, and `childTypes` to limit them |
| A void element (`editor.isVoid`) | `content: "empty"`, `leaf: true` |
| An inline element (`editor.isInline`), such as a link or a mention | A mark; an atomic mark for a token the caret must not enter |
| Element fields | `attrs`: every attribute declared with a type; undeclared ones are rejected |
| `RenderElementProps`: `attributes`, `children`, `element` | `BlockViewProps`: `rootProps`, `content` and `children`, `block` |
| A leaf property and its `renderLeaf` branch | A mark in `marks` |
| `normalizeNode` rules | Constraints of the node spec: `topLevel`, `childTypes`, `marksAllowed` |

The React and Vue renderers draw only the built-in marks, so text with a mark of your own
renders unformatted; show it with an inline decoration from a `plugin` (see
[Writing extensions](/docs/concepts/extensions#plugins-and-decorations)). An inline element
becomes a mark with `atomic: true`: the text is its fallback and the caret never enters it. See
[Inline atoms](/docs/extensions/inline-atoms).

Behaviour that a `withX(editor)` plugin added by overriding `insertText` or `insertData` moves to
the extension's `inputRules`, `pasteRules`, `transformPastedText` and `parsePastedText`. An input
rule is tested against the whole text of the block; see
[input rules](/docs/concepts/extensions#input-rules).

## Step 5: Port transforms and events

Slate transforms take paths and points. GoTipe commands act on the selection, and transactions
name blocks by ID and text by UTF-16 offset:

| Slate | GoTipe |
|---|---|
| `Editor.addMark(editor, "bold", true)` | `editor.chain().focus().toggleBold().run()`, or `addMark("bold")` |
| `Transforms.setNodes(editor, { type: "heading-two" })` | `chain().setBlockType("heading", { level: 2 }).run()` |
| `Transforms.setNodes(editor, { checked: true }, { at })` | `chain().setBlockAttrs(blockId, { checked: true }).run()` |
| `Transforms.wrapNodes` with a list | `toggleBulletList()`, `toggleOrderedList()`, `toggleTodoList()` |
| `Transforms.insertNodes(editor, node)` | `insertBlockAfter(type, attrs)`, or an `insertBlock` step |
| `Transforms.select(editor, range)` | `setSelection(selection)` |
| `Transforms.insertText(editor, text)` | `insertText(text)` |
| `editor.undo()`, `editor.redo()` | `editor.undo()`, `editor.redo()` |

A helper of your own becomes a function that takes the editor:

```ts title="commands.ts"
import type { GoTipeEditor } from "@gotipe/core";

export function insertNotice(editor: GoTipeEditor, tone: "info" | "warning" = "info"): boolean {
  return editor.chain().focus().insertBlockAfter("notice", { tone }).run();
}
```

A chain runs as one transaction and one undo step, and the editor checks the whole result
against the schema before anything changes; see [Transactions](/docs/concepts/transactions).

| Slate | GoTipe event |
|---|---|
| `onChange`, `onValueChange` of `<Slate>` | `update`, with `origin`: `"local"` or `"remote"` |
| `onSelectionChange` | `selectionChange` |
| `editor.onChange` with `editor.operations` | `transaction`, with `transaction`, `before` and `after` |
| `onKeyDown` of `Editable` | `keybindings` of an extension |

`editor.on(event, handler)` returns the function that removes the handler. Saving a value no
longer needs a check for selection-only operations: `update` fires only when the document
changes, or a mark is toggled at the caret.

## Step 6: Markdown and HTML

Slate ships no serializers; GoTipe has them built in. `editor.getMarkdown()` writes
GitHub-flavoured Markdown and replaces Plate's `editor.api.markdown.serialize()`. To load
Markdown, parse it with `@gotipe/markdown`:

```ts title="markdown.ts"
import type { GoTipeEditor } from "@gotipe/core";
import { parseMarkdown } from "@gotipe/markdown";

export function loadMarkdown(editor: GoTipeEditor, text: string) {
  editor.setContent(parseMarkdown(text).doc);
}
```

The parser keeps Markdown the editor cannot edit (HTML, footnotes) as `markdownRaw` blocks and
`mdRaw` text, so register both, as [Content formats](/docs/concepts/content-formats#markdown)
shows. If you stored Markdown rather than the value, you need no converter: parse the files.

`editor.getHTML()` replaces an HTML `serialize` function of your own or Plate's `serializeHtml`,
and `editor.setContent(html)` replaces a `deserialize` function; HTML import runs in the browser
only. On a server, `renderToHtml(doc)` from `@gotipe/core/server` renders without a DOM, and its
`blockRenderers` option gives your own block types their HTML. HTML import knows the built-in
elements, and the exporters write a type they do not know as a paragraph with its text. See
[Server rendering](/docs/concepts/content-formats#server-rendering). `editor.getText()` joins the
text of all blocks with `\n`, as the plain-text serializer of Slate's docs does.

## Step 7: Collaboration

There is no automatic conversion of Yjs state. GoTipe does not read a Y.Doc, `@slate-yjs/core`
or `@platejs/yjs` state, and GoTipe's own CRDT starts from a plain document. Move each shared
document this way:

1. Stop edits to the document in Slate or Plate, for example by making it read-only for the switch.
2. Take a snapshot of the value from an editor connected to the document: the value of `onChange`, or `editor.children` in Plate.
3. Convert the snapshot with `@gotipe/migration` as in step 2.
4. Store the result as the document's new baseline, for example with `POST /v1/documents` of GoTipe Cloud ([REST API](/docs/cloud/rest-api#create)).
5. Open it in GoTipe with `engine: "wasm"` and `@gotipe/collaboration`, as in [Connect to GoTipe Cloud](/docs/collaboration/overview#connect-to-gotipe-cloud).

Edits made after the snapshot are not in GoTipe, so take it last. The Yjs update history,
cursors and undo stacks are not carried over. Collaboration in GoTipe needs the WASM engine;
with your own server, use the editor's collaboration methods
([Your own transport](/docs/collaboration/overview#your-own-transport)).

## What GoTipe does not have

- **A schema-free document.** Slate accepts any element shape; GoTipe accepts only the block types and attributes its extensions declare.
- **Inline elements.** Links, mentions and other inline tokens are marks on text; an inline element with its own children has no counterpart.
- **Rendering every element and leaf yourself.** Views replace blocks one type at a time, and the React and Vue renderers draw only the built-in marks.
- **Method overrides and normalization.** There is no `normalizeNode`, `isInline` or `insertData` to override; extensions declare node specs, rules and hooks.
- **Operations and paths.** Changes are transactions of steps on block IDs, not Slate operations on paths.
- **Yjs interoperability.** GoTipe's CRDT is its own; `@slate-yjs/core` and Plate's `YjsPlugin` do not connect to it.
- **Plate's plugin set.** Font size and family, indentation of any block, and Plate elements without a GoTipe block type need a port or stay as JSON.
- **Converter coverage for every schema.** Element names outside the table in [Migration](/docs/conversion/migration#what-is-converted) need a mapping or stay as JSON.

## Related

- [Migration](/docs/conversion/migration): the converter's options, result and limits.
- [Document model](/docs/concepts/document-model) and [Writing extensions](/docs/concepts/extensions)
- [React](/docs/frameworks/react) and [Block editor](/docs/ui/block-editor)
- [Collaboration](/docs/collaboration/overview)
