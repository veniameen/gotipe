---
title: Writing extensions
description: Define block and mark types, keyboard shortcuts, input and paste rules, slash commands and plugins with defineExtension.
packages: ["@gotipe/core", "@gotipe/react"]
license: MIT
---

An extension adds to the editor's schema and behaviour: node types for blocks, mark types
for text, keyboard shortcuts, typing and paste rules, slash commands and a plugin with
state and decorations. Every built-in feature is an extension, and the presets are arrays
of them. Write one when you need a block type or a behaviour that GoTipe doesn't have.

## Define an extension

```ts
import { defineExtension } from "@gotipe/core";
import { DefaultPreset } from "@gotipe/core/presets";

const Shortcuts = defineExtension({
  name: "shortcuts",
  keybindings: [{ key: "Mod-Shift-l", command: (editor) => editor.chain().toggleBulletList().run() }],
});

const extensions = [DefaultPreset, Shortcuts];
```

`defineExtension<Options>(config)` returns an extension with `configure(options)`, which
returns a new extension whose options are shallowly merged over the defaults. The original
is unchanged.

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Unique name. A later extension with the same name replaces the earlier one. |
| `dependencies` | `string[]` | Names of extensions to set up first, when they are in the list. |
| `nodes` | `NodeSpec[]` | Block types. |
| `marks` | `MarkSpec[]` | Mark types. |
| `keybindings` | `Keybinding[]` | Keyboard shortcuts. |
| `inputRules` | `InputRule[]` | Rules that run after typing. |
| `pasteRules` | `PasteRule[]` | Rules that handle pasted text or files. |
| `transformPastedText` | `(text, context) => string` | Changes plain pasted text before it is inserted. |
| `parsePastedText` | `(text, context) => Block[] \| null` | Turns plain pasted text into blocks. |
| `atomSupport` | `InlineAtomSupport` | Collaboration repair and HTML read-back of atomic marks. The built-in atom extensions carry it; reuse theirs for your own (`atomSupport: Mention.atomSupport`). |
| `slashCommands` | `SlashCommandDef[]` | Entries for the slash menu. |
| `plugin` | `(options) => Plugin` | State, transaction hooks and decorations. |
| `options` | `Options` | Default options. |
| `onCreate`, `onUpdate`, `onDestroy` | `(editor) => void` | Lifecycle hooks. |

To change an extension that a preset already contains, add the configured version after
the preset: `[DefaultPreset, Image.configure({ maxSize: 2 * 1024 * 1024 })]`, with `Image`
from `@gotipe/core/extensions`.

## Node types

```ts
import type { NodeSpec } from "@gotipe/core";

const nodes: NodeSpec[] = [
  {
    name: "note",
    group: ["block"],
    content: "richText",
    attrs: { tone: { type: "enum", values: ["info", "warning"], default: "info" } },
    topLevel: true,
    marksAllowed: "all",
    leaf: false,
    allowsChildren: false,
  },
];
```

| Field | Type | Description |
|---|---|---|
| `name` | `string` | The value of `Block.type`. |
| `group` | `string[]` | Group names, such as `["block"]`. Stored in the schema; nesting is checked with `childTypes`. |
| `content` | `"richText" \| "rawText" \| "empty"` | What `Block.content` holds: spans, a string or `null`. |
| `attrs` | `Record<string, AttrSpec>` | Declared attributes. |
| `topLevel` | `boolean` | Whether the block may appear at the top level of the document. |
| `marksAllowed` | `"all" \| "none" \| string[]` | Marks allowed in the block's text. |
| `leaf` | `boolean` | A leaf never has children. |
| `allowsChildren` | `boolean` | Whether the block may have child blocks. |
| `childTypes` | `string[]` | Allowed child types. Omit to allow any type. |

Inside `defineExtension` the fields are typed for you. Declared on their own, annotate them
with `NodeSpec`, `MarkSpec`, `Keybinding` or `InputRule` from `@gotipe/core`, as the
snippets on this page do.

### Attributes

| Field | Type | Description |
|---|---|---|
| `type` | `"string" \| "number" \| "bool" \| "enum" \| "array" \| "object"` | Value type. Numbers must be finite. |
| `values` | `string[]` or `number[]` | Allowed values of an `enum`. For another type, the values commands create, such as `Heading` levels; documents may hold others. |
| `required` | `boolean` | The attribute must be present and not `null`. Default `false`. |
| `default` | `unknown` | Written by commands into a new block or mark that leaves the attribute out. Steps you dispatch are applied as written. |

## Mark types

```ts
import type { MarkSpec } from "@gotipe/core";

const marks: MarkSpec[] = [
  { name: "keyword", attrs: { term: { type: "string", required: true } }, rank: 20 },
];
```

| Field | Type | Description |
|---|---|---|
| `name` | `string` | The value of `Mark.type`. |
| `attrs` | `Record<string, AttrSpec>` | Mark attributes. |
| `rank` | `number` | Stored in the schema. |
| `exclusiveGroup` | `string` | Marks of one group exclude each other: adding one removes the others from that text. |

Adjacent spans merge only when their marks are equal, so give a mark only the attributes
that matter. The renderers draw built-in marks; for your own marks, see
[limitations](#limitations).

## Keyboard shortcuts

```ts
import type { Keybinding } from "@gotipe/core";

const keybindings: Keybinding[] = [
  {
    key: "Mod-Alt-n",
    command: (editor) => editor.chain().setBlockType("note", { tone: "info" }).run(),
  },
  // The Table extension's binding. At the table's last cell run() returns false,
  // so Tab falls through to the browser instead of entering the next table.
  { key: "Tab", when: "inTable", command: (editor) => editor.chain().goToNextCell().run() },
];
```

- `key` is a list of parts joined by `-`, case-insensitive. Modifiers are `Mod` (Cmd on
  macOS, Ctrl elsewhere), `Shift` and `Alt`; the last part is the key: `b`, `Enter`,
  `Tab`, `ArrowUp`, `.`. Modifiers match exactly: `Mod-b` doesn't fire with Shift held.
- Letters and digits also match by physical key, so shortcuts work on non-Latin layouts.
- `when` limits a binding to the caret's surroundings: `inTable`, `inCodeBlock`, `inList` or
  `inBlockquote`. Any other value always matches.
- Bindings are tried in extension order while the editor is editable. The first command
  that doesn't return `false` handles the key, and its default action is prevented.

## Input rules

```ts
import type { InputRule } from "@gotipe/core";

// "->" typed at the end of a block becomes an arrow.
const arrow: InputRule = {
  pattern: /->$/,
  handler: (editor) => {
    const { anchor, head } = editor.getViewState().selection;
    if (anchor.blockId !== head.blockId || anchor.offset !== head.offset || anchor.offset < 2) return;
    const at = anchor.offset - 2;
    editor.dispatch({
      steps: [
        { type: "deleteText", blockId: anchor.blockId, from: at, to: anchor.offset },
        { type: "insertText", blockId: anchor.blockId, offset: at, text: "→", marks: [] },
      ],
      selection: { type: "cursor", blockId: anchor.blockId, offset: at + 1 },
    });
  },
};
```

After each typed input in a rich-text block, the editor tests every rule, in extension
order, against the **whole text of the block**, not only the text before the caret. The
first match calls `handler(editor, match)` and stops, unless the handler returns `false`:
then the next rule is tried. Anchor patterns with `^` and `$`; here `$` is the end of the
block, so typing `->` in the middle of a line does nothing. To act at the caret anywhere in
a line, match loosely and let the handler check the text before the caret and return
`false` when it doesn't fit, as the built-in `**bold**` rules do.

The typed text is already in the document when the handler runs, so the handler's changes
are a separate undo step. Rules don't run in raw-text blocks or for text committed by an
IME.

## Paste rules

```ts title="paste-links.ts"
import { defineExtension } from "@gotipe/core";

export const PasteLinks = defineExtension({
  name: "pasteLinks",
  pasteRules: [
    {
      match: /^https?:\/\/\S+$/,
      handler: (editor, data) => {
        if (typeof data !== "string") return;
        const { anchor, head } = editor.getViewState().selection;
        if (anchor.blockId !== head.blockId) {
          editor.chain().insertText(data).run();
          return;
        }
        const from = Math.min(anchor.offset, head.offset);
        editor.chain().insertText(data).addMark("link", from, from + data.length, { href: data }).run();
      },
    },
  ],
});
```

- `match` is tested against the clipboard's plain text, or the MIME type of each pasted or
  dropped file. Content copied from a GoTipe editor keeps its structure and skips text
  rules. The built-in `Image` extension has a rule for `image/*`.
- The first matching rule handles the entry. `handler(editor, data, options)` gets a draft
  editor with the same schema and host (JS engine, without plugins or hooks), the text or
  `File`, and the extension's options. It may be async.
- When the handlers finish, the draft's changes are committed as one undoable transaction.
  If the document or selection changed in the meantime, the result is discarded with a
  `CLIPBOARD_FAILED` error. If a handler throws, nothing is inserted and the error is
  reported; the paste doesn't fall back to plain insertion.

## Pasted text

Two hooks act on plain clipboard text, after the paste rules and only when the clipboard holds neither content copied from a GoTipe editor nor HTML:

```ts title="paste-hooks.ts"
import { createId, defineExtension } from "@gotipe/core";

export const PasteHooks = defineExtension({
  name: "pasteHooks",
  // Runs first, in extension order. Returning "" pastes nothing.
  transformPastedText: (text) => text.replace(/\u00a0/g, " "),
  // The first extension that returns blocks decides; null leaves the text to the next one.
  parsePastedText: (text, { nodes }) =>
    "heading" in nodes && /^TITLE: /.test(text)
      ? [
          {
            id: createId(),
            type: "heading",
            attrs: { level: 1 },
            content: [{ text: text.slice(7), marks: [] }],
            children: [],
          },
        ]
      : null,
});
```

`context` is `{ editor, nodes, marks, options, safeHref, safeImageSrc }`: the live editor, the node and mark specs of its schema by name, this extension's options, and the editor's own address checks for links and images (they return the address, or `null` when it is unsafe).

- Without a parser, or when all return `null`, the text becomes one paragraph per line, as without the hooks.
- Parsers are not asked when the caret is in a raw-text block such as code: the text is inserted as it is.
- The blocks get new IDs and are inserted as one undoable transaction. If they cannot go where the caret is (block structure inside a table cell) or the result does not match the schema, the text is pasted as plain paragraphs instead.
- [CharacterCount](/docs/extensions/character-count) uses the first hook, [MarkdownPaste](/docs/extensions/links-and-paste#markdown-paste) the second.

## Slash commands

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Menu label. |
| `aliases` | `string[]` | Extra search terms. |
| `description` | `string` | Optional second line. |
| `icon` | `string` | Icon name. The ready UI shows the first letter of `name` for names it doesn't know. |
| `group` | `"ai" \| "style" \| "insert" \| "upload" \| string` | Menu section. |
| `execute` | `(editor) => void` | Runs the command. |
| `shouldShow` | `(editor) => boolean` | Optional; hide the command when it returns `false`. |

`editor.getSlashCommands()` returns the commands of all extensions in order. The slash
menu of `BlockEditor` lists them and removes the typed `/query` before calling `execute`;
see [menus](/docs/ui/menus).

## Plugins and decorations

`plugin(options)` is called once per editor with the configured options and returns
optional hooks:

| Hook | When |
|---|---|
| `init(state)` | Once, after the document and the initial selection exist. |
| `apply(transaction, state)` | After each committed local transaction. Not for Undo, `setContent` or remote updates. |
| `decorations(state)` | After every `update` and `selectionChange`. The result replaces the layer `extension:<name>`. |
| `destroy()` | When the editor is destroyed or its creation fails. |

`state` is `{ doc, selection }` with detached copies. Decorations add presentation without
changing the document: `inline` wraps text `[from, to)` with a class or attributes,
`widget` shows non-editable text at an offset, `node` adds a class or attributes to a
block, and `blocks` shows read-only blocks before or after a block. Outside plugins, set a
layer with `editor.setDecorations(layer, decorations)`.

`EditorContent` of `@gotipe/react` and of `@gotipe/vue` draw every layer. Besides the four
generic kinds they draw the decorations of the built-in features with fixed classes:

| Decoration | Drawn as |
|---|---|
| `placeholder` | `data-placeholder` on the empty block, while editable |
| `comment-highlight` | `<span class="gotipe-comment-highlight" data-comment-id>`, plus `resolved` |
| `suggestion-insert`, `suggestion-delete` | `<span class="gotipe-suggestion-insert">` or `-delete`, with `data-suggestion-id` |
| `remote-selection` | `<span class="gotipe-remote-range" data-peer-id>` tinted with the person's color |
| `remote-cursor` | A widget `<span class="gotipe-remote-cursor" data-peer-id>` with `gotipe-remote-cursor-caret` and `gotipe-remote-cursor-label` |
| `ghost-text` | A widget `<span class="gotipe-ghost-text" data-gotipe-ghost-text>` |

A range is wrapped in `<span data-gotipe-decoration>`; a widget is `contenteditable="false"`
with `data-gotipe-widget` and never counts in offsets. Colors of people pass `toSafeColor`.
When only decorations change, both renderers keep the native caret where it was.

While the browser composes text with an IME (`editor.isComposing`), the composing block
belongs to the browser: `setDecorations` waits until the composition ends, both renderers
keep the block's decorations as they were drawn and leave the native selection alone, and
the new decorations are drawn when the composition ends.

A `placeholder` decoration with an empty `text` asks for the renderer's own words: React
shows its placeholder for that block in the interface language, Vue asks the `placeholder`
function you pass to `EditorContent`.

To draw a layer yourself, pass its name in `hostLayers` (`EditorContent` of both adapters,
and `Editor` of `@gotipe/react`): the renderer leaves that layer out and still draws the
rest. `BlockEditor` does this for `collaboration` and draws those people with its overlay.

## Lifecycle

1. The editor flattens the extension list, keeps the last extension of each name and
   orders dependencies first. A dependency cycle rejects `createEditor` with
   `EXTENSION_DEPENDENCY_CYCLE`.
2. It builds the schema from all node and mark types and validates the document.
3. For each extension in order: `plugin(options)`, `plugin.init(state)`, then
   `onCreate(editor)`. An exception here rejects `createEditor`; what was created is
   cleaned up.
4. While the editor runs, `onUpdate(editor)` follows every `update` event.
5. `destroy()` runs `plugin.destroy()` and `onDestroy(editor)` in reverse order and clears
   each extension's decorations.

Errors in `apply`, `decorations`, `onUpdate` and `destroy` are reported as
`EXTENSION_ERROR` through the `error` event; the editor keeps running.

Only `plugin` and paste-rule handlers receive the options as an argument. Lifecycle hooks
written as methods can read them as `this.options`. Shortcuts, input rules and slash
commands don't see options; build the extension in a function if they need them.

## Complete example

A `note` block with a tone, a shortcut, an input rule, a slash command and a plugin that
highlights a configurable keyword.

```ts title="note.ts"
import { type Block, type Decoration, defineExtension } from "@gotipe/core";

export interface NoteOptions {
  /** Text highlighted inside notes. */
  keyword: string;
}

function findKeyword(blocks: Block[], keyword: string, found: Decoration[] = []): Decoration[] {
  for (const block of blocks) {
    if (block.type === "note" && Array.isArray(block.content) && keyword) {
      const text = block.content.map((span) => span.text).join("");
      for (let from = text.indexOf(keyword); from !== -1; from = text.indexOf(keyword, from + 1)) {
        found.push({
          type: "inline",
          key: `keyword-${from}`,
          blockId: block.id,
          from,
          to: from + keyword.length,
          className: "note-keyword",
        });
      }
    }
    findKeyword(block.children, keyword, found);
  }
  return found;
}

export const Note = defineExtension<NoteOptions>({
  name: "note",
  options: { keyword: "TODO" },
  nodes: [
    {
      name: "note",
      group: ["block"],
      content: "richText",
      attrs: { tone: { type: "enum", values: ["info", "warning"], default: "info" } },
      topLevel: true,
      marksAllowed: "all",
      leaf: false,
      allowsChildren: false,
    },
  ],
  keybindings: [
    {
      key: "Mod-Alt-n",
      command: (editor) => editor.chain().setBlockType("note", { tone: "info" }).run(),
    },
  ],
  inputRules: [
    {
      // "!! " typed into an empty paragraph turns it into a note.
      pattern: /^!!\s$/,
      handler: (editor, match) => {
        const block = editor.getCurrentBlock();
        if (block?.type !== "paragraph") return;
        editor.dispatch({
          steps: [
            { type: "deleteText", blockId: block.id, from: 0, to: match[0].length },
            { type: "setBlockType", blockId: block.id, newType: "note", attrs: { tone: "info" } },
          ],
        });
      },
    },
  ],
  slashCommands: [
    {
      name: "Note",
      aliases: ["callout", "warning"],
      description: "Highlighted note",
      icon: "alert-circle",
      group: "style",
      execute: (editor) => {
        editor.chain().setBlockType("note", { tone: "info" }).run();
      },
    },
  ],
  plugin: (options) => {
    const { keyword } = options as NoteOptions;
    return { decorations: (state) => findKeyword(state.doc.blocks, keyword) };
  },
});
```

The renderer needs a view for the new type. With `@gotipe/react`, pass it in
`blockViews`; spread `rootProps` on the root element so the editor can find the block:

```tsx title="NoteView.tsx"
import type { BlockViewProps } from "@gotipe/react";
import type { HTMLAttributes } from "react";

export function NoteView({ block, rootProps, content }: BlockViewProps) {
  const tone = block.attrs.tone === "warning" ? "warning" : "info";
  return (
    <aside
      {...(rootProps as HTMLAttributes<HTMLElement>)}
      data-block-type="note"
      data-tone={tone}
      className={["note", rootProps.className].filter(Boolean).join(" ")}
    >
      {content}
    </aside>
  );
}
```

```tsx title="Editor.tsx"
import { DefaultPreset } from "@gotipe/core/presets";
import { EditorContent, useEditor } from "@gotipe/react";
import { Note } from "./note";
import { NoteView } from "./NoteView";
import "./note.css";

export function Editor() {
  const editor = useEditor({
    extensions: [DefaultPreset, Note.configure({ keyword: "FIXME" })],
    engine: "js",
  });
  return <EditorContent editor={editor} blockViews={{ note: NoteView }} />;
}
```

```css title="note.css"
.note { margin: 8px 0; padding: 12px 16px; border-left: 4px solid #2c62d4; background: #e6ecfa; }
.note[data-tone="warning"] { border-left-color: #9a6500; background: #fbf0ce; }
.note-keyword { font-weight: 600; text-decoration: underline; }
```

`BlockEditor` takes the same `blockViews` prop and also lists the slash command.

## Limitations

- `insertBlockAfter`, `insertBlockBefore` and `setBlockType` choose content from the
  built-in type names, so they fail for your own `rawText` and `empty` node types. Insert
  such blocks with an `insertBlock` step that carries the content.
- `rank` is stored in the schema but not used yet.
- The React and Vue renderers draw only the built-in marks; text with your own mark
  renders unformatted. Use an `inline` decoration to show it.
- HTML and Markdown output write an unknown block as a paragraph with its text, without
  its type and attributes. Server rendering can take your own HTML for it; see
  [content formats](/docs/concepts/content-formats#server-rendering).
- `accessibility` and `storageKey` exist on the extension type but the core doesn't read
  them.

## Related

- [Document model](/docs/concepts/document-model)
- [Commands](/docs/concepts/commands) and [transactions](/docs/concepts/transactions)
- [Built-in extensions](/docs/extensions/overview)
- [React block views](/docs/frameworks/react)
