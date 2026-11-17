# GoTipe -- Migration Guide

> **Historical specification, not a guide to the current API.** The examples, timelines,
> performance comparisons, commercial terms and promises below do not confirm an
> implementation or the availability of the service. Current references: [contracts](development/migration-contract.md),
> [code map](development/code-map.md), [checks](development/testing.md),
> [release plan](22-release-readiness.md). Licenses are defined by `LICENSE` and the manifest
> of each package, not by this document.

> A guide to migrating to GoTipe from other rich text editor frameworks. Covers Tiptap, ProseMirror, Lexical, Slate, CKEditor and TinyMCE.

---

## 1. Migration Overview

### Why Migrate to GoTipe

| Reason | Details |
|--------|---------|
| **Performance** | Rust/WASM core: parsing, validation, CRDT and transforms are 2-5x faster than ProseMirror-based solutions. See [01-architecture.md#performance](01-architecture.md#performance) |
| **Native CRDT** | Collaboration is built into the core and works without the cloud. No vendor lock-in on Hocuspocus/Liveblocks/Tiptap Cloud |
| **AI-first** | Ghost text, AI commands and streaming are in the core, not an addon. Provider-agnostic. See [07-ai.md](07-ai.md) |
| **Honest open source** | All extensions are MIT. No Pro tier, no paywall on collaboration |
| **Framework-agnostic** | React, Vue, Svelte, Solid: a thin adapter layer. The core does not depend on a framework |
| **Server-side** | The WASM core runs in Node.js, Go and Rust: validation and rendering without a browser |
| **Block-first model** | Notion-like UX out of the box: slash commands, drag-and-drop, nested blocks |

### What Sets GoTipe Apart from Other Solutions

```
Tiptap / ProseMirror:
  JS core → OT/Yjs collaboration → framework wrappers

GoTipe:
  Rust/WASM core → native CRDT → framework adapters (thin layer)
```

**Key architectural differences:**

1. **Document model.** GoTipe uses a block-first model (like Notion), not a generic node tree (ProseMirror). Every block has `id`, `type`, `attrs`, `content` and `children`.
2. **State management.** Immutable `EditorState` with transaction-based updates. Similar to ProseMirror, but the types are defined in Rust.
3. **Extension system.** A single `defineExtension()` API instead of class-based Node.create() / Mark.create(). Dependencies are explicit.
4. **Collaboration.** The CRDT is built into the core (not an external Yjs adapter). Binary sync protocol.
5. **Rendering.** The core emits a `ViewState` (plain JS objects). The adapter converts it into framework-specific components.

### Migration Complexity Matrix

| Source | Complexity | Time (estimate) | Main work |
|--------|------------|-----------------|-----------|
| **Tiptap** | Medium | 2-5 days | Extension mapping, replacing the React/Vue adapter, content conversion |
| **ProseMirror** | Medium-High | 3-7 days | Schema mapping, reworking plugins, replacing the view layer |
| **Lexical** | Medium | 2-5 days | Rebuilding the node model, plugin mapping, replacing React hooks |
| **Slate** | Medium | 2-5 days | Document model mapping, replacing plugins, React adapter |
| **CKEditor 5** | Low-Medium | 1-3 days | Content conversion (HTML), toolbar mapping |
| **TinyMCE** | Low | 1-2 days | HTML content conversion, configuration |
| **Quill** | Medium | 2-4 days | Delta format conversion, module mapping |

> **Tip:** Whatever the source editor, start with content conversion (JSON/HTML), then set up extensions, and only then migrate custom plugins.

---

## 2. Migrating from Tiptap

Tiptap is the most common migration path, since GoTipe is designed as its evolution. Many APIs are intentionally similar.

### 2.1. Document Model: ProseMirror Node vs GoTipe Block

**Tiptap (ProseMirror) Document:**

```json
{
  "type": "doc",
  "content": [
    {
      "type": "heading",
      "attrs": { "level": 1 },
      "content": [
        { "type": "text", "text": "Hello World" }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "This is " },
        { "type": "text", "marks": [{ "type": "bold" }], "text": "bold" },
        { "type": "text", "text": " text." }
      ]
    }
  ]
}
```

**GoTipe Document:**

```json
{
  "version": 1,
  "blocks": [
    {
      "id": "b1",
      "type": "heading",
      "attrs": { "level": 1 },
      "content": [
        { "text": "Hello World", "marks": [] }
      ],
      "children": []
    },
    {
      "id": "b2",
      "type": "paragraph",
      "attrs": {},
      "content": [
        { "text": "This is ", "marks": [] },
        { "text": "bold", "marks": [{ "type": "bold" }] },
        { "text": " text.", "marks": [] }
      ],
      "children": []
    }
  ]
}
```

**Key differences:**

| Aspect | Tiptap (ProseMirror) | GoTipe |
|--------|---------------------|--------|
| Root element | `{ type: "doc", content: [...] }` | `{ version: 1, blocks: [...] }` |
| Node identifier | None (positional) | `id` on every block (string) |
| Text node | `{ type: "text", text: "...", marks: [...] }` | `{ text: "...", marks: [...] }` (no type) |
| Marks on text | A separate `marks` object with `type` and `attrs` | Same, but `marks` is always present (even as an empty array) |
| Nesting | Via the `content` expression | Via the `children` array |
| Lists | `bulletList > listItem > paragraph` | `bulletList > children: [listItem]`, listItem holds its content directly |

### 2.2. Extension Mapping

| Tiptap Extension | GoTipe Extension | Package | Differences |
|-----------------|-----------------|---------|-------------|
| `StarterKit` | `DefaultPreset` | `@gotipe/core/presets` | A preset instead of a single extension |
| `Document` | Built into the core | `@gotipe/core` | No separate extension needed |
| `Paragraph` | `Paragraph` | `@gotipe/core/extensions` | 1:1 |
| `Text` | Built into the core | `@gotipe/core` | No separate extension needed |
| `Heading` | `Heading` | `@gotipe/core/extensions` | 1:1, `.configure({ levels: [1,2,3] })` |
| `Bold` | `Bold` | `@gotipe/core/extensions` | 1:1 |
| `Italic` | `Italic` | `@gotipe/core/extensions` | 1:1 |
| `Underline` | `Underline` | `@gotipe/core/extensions` | 1:1 |
| `Strike` | `Strikethrough` | `@gotipe/core/extensions` | Renamed |
| `Code` | `InlineCode` | `@gotipe/core/extensions` | Renamed |
| `CodeBlock` / `CodeBlockLowlight` | `CodeBlock` | `@gotipe/core/extensions` | Syntax highlighting in `.configure()` |
| `BulletList` | `BulletList` | `@gotipe/core/extensions` | 1:1 |
| `OrderedList` | `OrderedList` | `@gotipe/core/extensions` | 1:1 |
| `ListItem` | `ListItem` | `@gotipe/core/extensions` | 1:1 |
| `TaskList` / `TaskItem` | `TodoList` | `@gotipe/core/extensions` | Merged into one extension |
| `Blockquote` | `Blockquote` | `@gotipe/core/extensions` | 1:1 |
| `HorizontalRule` | `Divider` | `@gotipe/core/extensions` | Renamed |
| `Link` | `Link` | `@gotipe/core/extensions` | 1:1 |
| `Image` | `Image` | `@gotipe/core/extensions` | 1:1, upload handler in `.configure()` |
| `Table` / `TableRow` / `TableCell` / `TableHeader` | `Table` | `@gotipe/core/extensions` | All in one extension |
| `Highlight` | `Highlight` | `@gotipe/core/extensions` | 1:1 |
| `Superscript` | `Superscript` | `@gotipe/core/extensions` | 1:1 |
| `Subscript` | `Subscript` | `@gotipe/core/extensions` | 1:1 |
| `TextAlign` | `TextAlign` | `@gotipe/core/extensions` | 1:1 |
| `Placeholder` | `Placeholder` | `@gotipe/core/extensions` | 1:1, `.configure({ text: '...' })` |
| `History` | `History` | `@gotipe/core/extensions` | 1:1 |
| `Dropcursor` | Built into `DragAndDrop` | `@gotipe/core/extensions` | Enabled automatically |
| `Gapcursor` | Built into the core | `@gotipe/core` | Automatic |
| `Typography` | `Typography` | `@gotipe/core/extensions` | 1:1 |
| `CharacterCount` | `CharacterCount` | `@gotipe/core/extensions` | 1:1 |
| `Color` / `TextStyle` | `TextColor` | `@gotipe/core/extensions` | Merged |
| `FontFamily` | `FontFamily` | `@gotipe/core/extensions` | 1:1 |
| `Collaboration` | `Collaboration` | `@gotipe/collaboration` | CRDT instead of Yjs (+ Yjs adapter) |
| `CollaborationCursor` | Built into `Collaboration` | `@gotipe/collaboration` | Awareness is on by default |
| `Mention` | `Mention` | `@gotipe/ext-mention` | Separate package |
| `Youtube` / `Embed` | `Embed` | `@gotipe/core/extensions` | Universal embed |
| `Mathematics` | `Math` | `@gotipe/ext-math` | Separate package |

### 2.3. API Mapping

#### Creating an Editor

**Tiptap (before):**

```typescript
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';

const editor = useEditor({
  extensions: [
    StarterKit,
    Highlight.configure({ multicolor: true }),
  ],
  content: '<p>Hello World</p>',
  onUpdate: ({ editor }) => {
    console.log(editor.getJSON());
  },
});
```

**GoTipe (after):**

```typescript
import { useEditor, Editor } from '@gotipe/react';
import { DefaultPreset } from '@gotipe/core/presets';
import { Highlight } from '@gotipe/core/extensions';

const editor = useEditor({
  extensions: [
    ...DefaultPreset,
    Highlight.configure({ multicolor: true }),
  ],
  content: '<p>Hello World</p>',
  onUpdate: ({ editor }) => {
    console.log(editor.getJSON());
  },
});
```

#### Commands

| Tiptap Command | GoTipe Command | Differences |
|---------------|---------------|-------------|
| `editor.commands.toggleBold()` | `editor.chain().toggleBold().run()` | Chainable API |
| `editor.chain().toggleBold().focus().run()` | `editor.chain().toggleBold().run()` | Focus is implicit |
| `editor.commands.setContent(html)` | `editor.setContent(html)` | Direct method |
| `editor.getJSON()` | `editor.getJSON()` | 1:1 (different JSON format) |
| `editor.getHTML()` | `editor.getHTML()` | 1:1 |
| `editor.getText()` | `editor.getText()` | 1:1 |
| `editor.isActive('bold')` | `editor.isActive('bold')` | 1:1 |
| `editor.isActive('heading', { level: 1 })` | `editor.isActive('heading', { level: 1 })` | 1:1 |
| `editor.can().toggleBold().run()` | `editor.can().toggleBold()` | Without `.run()` |
| `editor.commands.insertContent(...)` | `editor.chain().insertContent(...).run()` | Chain-based |
| `editor.commands.setTextSelection(pos)` | `editor.chain().setSelection({ blockId, offset }).run()` | Block-based selection |
| `editor.state.doc.textContent` | `editor.getText()` | Method instead of property |

#### Events

| Tiptap Event | GoTipe Event | Differences |
|-------------|-------------|-------------|
| `onUpdate` | `onUpdate` | 1:1 |
| `onSelectionUpdate` | `onSelectionChange` | Renamed |
| `onFocus` | `onFocus` | 1:1 |
| `onBlur` | `onBlur` | 1:1 |
| `onCreate` | `onCreate` | 1:1 |
| `onDestroy` | `onDestroy` | 1:1 |
| `onTransaction` | `editor.on('transaction', cb)` | Via EventEmitter |
| `onBeforeCreate` | No equivalent | -- |

### 2.4. React Adapter

**Tiptap React (before):**

```tsx
import { useEditor, EditorContent, BubbleMenu, FloatingMenu } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

function MyEditor() {
  const editor = useEditor({
    extensions: [StarterKit],
    content: '<p>Hello</p>',
  });

  if (!editor) return null;

  return (
    <>
      <BubbleMenu editor={editor}>
        <button onClick={() => editor.chain().focus().toggleBold().run()}>
          Bold
        </button>
      </BubbleMenu>
      <EditorContent editor={editor} />
    </>
  );
}
```

**GoTipe React (after):**

```tsx
import { useEditor, Editor, BubbleMenu } from '@gotipe/react';
import { DefaultPreset } from '@gotipe/core/presets';

function MyEditor() {
  const editor = useEditor({
    extensions: DefaultPreset,
    content: '<p>Hello</p>',
  });

  if (!editor) return null;

  return (
    <Editor editor={editor}>
      <BubbleMenu editor={editor}>
        {({ editor }) => (
          <button onClick={() => editor.chain().toggleBold().run()}>
            Bold
          </button>
        )}
      </BubbleMenu>
    </Editor>
  );
}
```

**React adapter differences:**

| Aspect | Tiptap React | GoTipe React |
|--------|-------------|-------------|
| Main component | `<EditorContent editor={editor} />` | `<Editor editor={editor} />` |
| BubbleMenu | `<BubbleMenu editor={editor}>children</BubbleMenu>` | `<BubbleMenu editor={editor}>{(props) => children}</BubbleMenu>` (render function) |
| FloatingMenu | `<FloatingMenu editor={editor}>children</FloatingMenu>` | `<FloatingMenu editor={editor}>{(props) => children}</FloatingMenu>` |
| State selector | `editor.storage.characterCount.characters()` | `useEditorState(editor, state => ...)` |
| Focus in a chain | `editor.chain().focus().toggleBold().run()` | `editor.chain().toggleBold().run()` (focus is automatic) |
| Styles | `import '@tiptap/core/style.css'` or `import '@tiptap/react/style.css'` | `import '@gotipe/react/styles.css'` |
| Slots | None | `slotBefore`, `slotAfter` props |
| Custom renderer | `NodeViewRenderer` | `blockRenderer` prop |
| WASM loading | None (JS only) | Editor = null until WASM loads |

### 2.5. Vue Adapter

**Tiptap Vue (before):**

```vue
<script setup>
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';

const editor = useEditor({
  extensions: [StarterKit],
  content: '<p>Hello</p>',
});
</script>

<template>
  <BubbleMenu :editor="editor" v-if="editor">
    <button @click="editor.chain().focus().toggleBold().run()">Bold</button>
  </BubbleMenu>
  <EditorContent :editor="editor" />
</template>
```

**GoTipe Vue (after):**

```vue
<script setup>
import { useEditor, Editor, BubbleMenu } from '@gotipe/vue';
import { DefaultPreset } from '@gotipe/core/presets';

const editor = useEditor({
  extensions: DefaultPreset,
  content: '<p>Hello</p>',
});
</script>

<template>
  <Editor :editor="editor" v-if="editor">
    <template #before>
      <Toolbar :editor="editor" />
    </template>
    <BubbleMenu :editor="editor">
      <button @click="editor.chain().toggleBold().run()">Bold</button>
    </BubbleMenu>
  </Editor>
</template>
```

**Vue adapter differences:**

| Aspect | Tiptap Vue 3 | GoTipe Vue |
|--------|-------------|-----------|
| Main component | `<EditorContent :editor="editor" />` | `<Editor :editor="editor" />` |
| Slots | None | `#before`, `#after`, `#block` |
| Reactivity | `shallowRef` | `shallowRef` + `triggerRef` |
| State selector | `editor.value?.isActive('bold')` | `useEditorState(editor, s => s.toolbar.activeMarks)` |
| Focus | `editor.chain().focus().toggleBold().run()` | `editor.chain().toggleBold().run()` |

More on the Vue adapter in [06-framework-adapters.md#vue](06-framework-adapters.md#vue).

### 2.6. Collaboration: Yjs/Hocuspocus -> GoTipe CRDT

GoTipe supports two collaboration migration paths:

#### Path 1: Gradual (Yjs Compatibility Adapter)

Use `@gotipe/collaboration/adapters/yjs` to work with an existing Hocuspocus server:

```typescript
// Step 1: Use the Yjs adapter (works with the existing Hocuspocus)
import { Collaboration } from '@gotipe/collaboration';
import { YjsAdapter } from '@gotipe/collaboration/adapters/yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';

const hocuspocus = new HocuspocusProvider({
  url: 'wss://your-hocuspocus-server.com',
  name: 'doc-123',
});

const editor = createEditor({
  extensions: [
    ...DefaultPreset,
    Collaboration.configure({
      provider: new YjsAdapter(hocuspocus),
    }),
  ],
});
```

```typescript
// Step 2: Switch to the native GoTipe CRDT (later)
import { Collaboration } from '@gotipe/collaboration';
import { GoTipeProvider } from '@gotipe/collaboration';

const editor = createEditor({
  extensions: [
    ...DefaultPreset,
    Collaboration.configure({
      provider: new GoTipeProvider({
        url: 'wss://sync.gotipe.com',
        documentId: 'doc-123',
      }),
    }),
  ],
});
```

#### Path 2: Direct (GoTipe CRDT)

1. Deploy the GoTipe Sync Server (self-hosted or GoTipe Cloud)
2. Migrate documents from the Yjs format to the GoTipe CRDT
3. Switch the clients to the GoTipe Provider

```typescript
// Yjs -> GoTipe CRDT migration script
import * as Y from 'yjs';
import { GoTipeCRDT } from '@gotipe/collaboration/migration';

async function migrateDocument(yjsState: Uint8Array): Promise<Uint8Array> {
  // 1. Load the Yjs document
  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, yjsState);

  // 2. Extract the ProseMirror JSON from Yjs
  const prosemirrorJson = yXmlFragmentToJson(ydoc.getXmlFragment('default'));

  // 3. Convert ProseMirror JSON -> GoTipe JSON
  const gotipeJson = convertProseMirrorToGoTipe(prosemirrorJson);

  // 4. Create the GoTipe CRDT document
  const crdtDoc = GoTipeCRDT.fromJson(gotipeJson);
  return crdtDoc.encodeSnapshot();
}
```

More on collaboration in [02-collaboration.md](02-collaboration.md).

### 2.7. Step-by-Step Migration from Tiptap

**Step 1: Install GoTipe**

```bash
# Remove the Tiptap packages
npm uninstall @tiptap/core @tiptap/react @tiptap/starter-kit \
  @tiptap/extension-heading @tiptap/extension-bold # ... and so on

# Install GoTipe
npm install @gotipe/core @gotipe/react
# Optional:
npm install @gotipe/collaboration @gotipe/ai
```

**Step 2: Replace imports**

```typescript
// Before (Tiptap):
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

// After (GoTipe):
import { useEditor, Editor } from '@gotipe/react';
import { DefaultPreset } from '@gotipe/core/presets';
```

**Step 3: Update the editor configuration**

```typescript
// Before:
const editor = useEditor({
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    Highlight,
    Underline,
  ],
  content: initialContent,
});

// After:
import { Heading, Highlight, Underline } from '@gotipe/core/extensions';

const editor = useEditor({
  extensions: [
    ...DefaultPreset.filter(ext => ext.name !== 'heading'),
    Heading.configure({ levels: [1, 2, 3] }),
    Highlight,
    Underline,
  ],
  content: initialContent, // The JSON format needs conversion!
});
```

**Step 4: Convert the content**

```typescript
// Use the conversion utility (see section 7)
import { convertProseMirrorToGoTipe } from '@gotipe/migration';

const tiptapJson = await fetchDocumentFromDB();
const gotipeJson = convertProseMirrorToGoTipe(tiptapJson);

const editor = useEditor({
  extensions: DefaultPreset,
  content: gotipeJson,
});
```

**Step 5: Update the components**

```tsx
// Before:
return <EditorContent editor={editor} className="my-editor" />;

// After:
return <Editor editor={editor} className="my-editor" />;
```

**Step 6: Update chain commands**

```typescript
// Before:
editor.chain().focus().toggleBold().run();

// After:
editor.chain().toggleBold().run();
// focus() is not needed: GoTipe focuses the editor automatically
```

**Step 7: Update NodeViews -> blockRenderer**

```tsx
// Before (Tiptap NodeView):
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';

function CalloutView({ node, updateAttributes }) {
  return (
    <NodeViewWrapper className="callout">
      <span>{node.attrs.emoji}</span>
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

// Extension:
Callout.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
});

// After (GoTipe blockRenderer):
<Editor
  editor={editor}
  blockRenderer={({ block, children }) => {
    if (block.type === 'callout') {
      return (
        <div className="callout">
          <span>{block.attrs.emoji as string}</span>
          <div>{children}</div>
        </div>
      );
    }
    return null; // default renderer
  }}
/>
```

### 2.8. Content Conversion: ProseMirror JSON -> GoTipe JSON

```typescript
// packages/migration/src/prosemirror-to-gotipe.ts

import { v4 as uuid } from 'uuid';

interface ProseMirrorNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: ProseMirrorNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
}

interface GoTipeBlock {
  id: string;
  type: string;
  attrs: Record<string, unknown>;
  content: Array<{ text: string; marks: Array<{ type: string; attrs?: Record<string, unknown> }> }>;
  children: GoTipeBlock[];
}

interface GoTipeDocument {
  version: number;
  blocks: GoTipeBlock[];
}

/**
 * Converts ProseMirror/Tiptap JSON to GoTipe JSON.
 */
export function convertProseMirrorToGoTipe(pmDoc: ProseMirrorNode): GoTipeDocument {
  if (pmDoc.type !== 'doc' || !pmDoc.content) {
    throw new Error('Invalid ProseMirror document: root must be "doc" with "content"');
  }

  return {
    version: 1,
    blocks: pmDoc.content.map(node => convertNode(node)),
  };
}

function convertNode(node: ProseMirrorNode): GoTipeBlock {
  const block: GoTipeBlock = {
    id: uuid(),
    type: mapNodeType(node.type),
    attrs: mapAttrs(node.type, node.attrs ?? {}),
    content: [],
    children: [],
  };

  if (node.content) {
    // Split into inline content and block children
    const inlineNodes = node.content.filter(n => n.type === 'text' || isInlineNode(n));
    const blockNodes = node.content.filter(n => n.type !== 'text' && !isInlineNode(n));

    // Inline content -> GoTipe content (TextSpan[])
    if (inlineNodes.length > 0) {
      block.content = inlineNodes.map(n => ({
        text: n.text ?? '',
        marks: (n.marks ?? []).map(m => ({
          type: mapMarkType(m.type),
          ...(m.attrs ? { attrs: m.attrs } : {}),
        })),
      }));
    }

    // Block children
    if (blockNodes.length > 0) {
      block.children = blockNodes.map(n => convertNode(n));
    }
  }

  return block;
}

function mapNodeType(pmType: string): string {
  const mapping: Record<string, string> = {
    'paragraph': 'paragraph',
    'heading': 'heading',
    'bulletList': 'bulletList',
    'bullet_list': 'bulletList',
    'orderedList': 'orderedList',
    'ordered_list': 'orderedList',
    'listItem': 'listItem',
    'list_item': 'listItem',
    'codeBlock': 'codeBlock',
    'code_block': 'codeBlock',
    'blockquote': 'blockquote',
    'horizontalRule': 'divider',
    'horizontal_rule': 'divider',
    'image': 'image',
    'table': 'table',
    'tableRow': 'tableRow',
    'table_row': 'tableRow',
    'tableCell': 'tableCell',
    'table_cell': 'tableCell',
    'tableHeader': 'tableHeader',
    'table_header': 'tableHeader',
    'hardBreak': 'hardBreak',
    'hard_break': 'hardBreak',
    'taskList': 'todoList',
    'taskItem': 'todoItem',
  };
  return mapping[pmType] ?? pmType;
}

function mapMarkType(pmMark: string): string {
  const mapping: Record<string, string> = {
    'bold': 'bold',
    'strong': 'bold',
    'italic': 'italic',
    'em': 'italic',
    'underline': 'underline',
    'strike': 'strikethrough',
    'strikethrough': 'strikethrough',
    'code': 'code',
    'link': 'link',
    'highlight': 'highlight',
    'superscript': 'superscript',
    'subscript': 'subscript',
    'textStyle': 'textStyle',
  };
  return mapping[pmMark] ?? pmMark;
}

function mapAttrs(type: string, attrs: Record<string, unknown>): Record<string, unknown> {
  // Remove ProseMirror-specific attrs
  const cleaned = { ...attrs };
  delete cleaned['class'];

  // Specific mappings
  if (type === 'codeBlock' || type === 'code_block') {
    return { language: attrs.language ?? 'plain' };
  }

  return cleaned;
}

function isInlineNode(node: ProseMirrorNode): boolean {
  return ['text', 'hardBreak', 'hard_break', 'image'].includes(node.type);
}
```

---

## 3. Migrating from ProseMirror

ProseMirror is the low-level framework that Tiptap is built on. Migration is harder because ProseMirror requires more custom code.

### 3.1. Schema Mapping

**ProseMirror Schema (before):**

```typescript
import { Schema, NodeSpec, MarkSpec } from 'prosemirror-model';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM() { return ['p', 0]; },
    },
    heading: {
      attrs: { level: { default: 1 } },
      content: 'inline*',
      group: 'block',
      parseDOM: [
        { tag: 'h1', attrs: { level: 1 } },
        { tag: 'h2', attrs: { level: 2 } },
        { tag: 'h3', attrs: { level: 3 } },
      ],
      toDOM(node) { return ['h' + node.attrs.level, 0]; },
    },
    text: { group: 'inline' },
  },
  marks: {
    bold: {
      parseDOM: [{ tag: 'strong' }, { tag: 'b' }],
      toDOM() { return ['strong', 0]; },
    },
    link: {
      attrs: { href: {}, target: { default: '_blank' } },
      parseDOM: [{ tag: 'a', getAttrs(dom) { return { href: dom.getAttribute('href') }; } }],
      toDOM(mark) { return ['a', { href: mark.attrs.href, target: mark.attrs.target }, 0]; },
    },
  },
});
```

**GoTipe Extensions (after):**

```typescript
import { defineExtension } from '@gotipe/core';

// GoTipe does not use a Schema object directly.
// The schema is assembled automatically from the extensions.
// parseDOM/toDOM are replaced by HTML import/export in the gotipe-export crate.

const Paragraph = defineExtension({
  name: 'paragraph',
  nodes: [{
    name: 'paragraph',
    group: ['block'],
    content: 'richText',
    attrs: {},
    topLevel: true,
    marksAllowed: 'all',
    leaf: false,
    allowsChildren: false,
  }],
});

const Heading = defineExtension({
  name: 'heading',
  nodes: [{
    name: 'heading',
    group: ['block'],
    content: 'richText',
    attrs: {
      level: { type: 'enum', values: ['1','2','3','4','5','6'], default: 1 },
    },
    topLevel: true,
    marksAllowed: 'all',
    leaf: false,
    allowsChildren: false,
  }],
});

// Marks are defined similarly
const Bold = defineExtension({
  name: 'bold',
  marks: [{ name: 'bold', attrs: {}, rank: 10 }],
  keybindings: [
    { key: 'Mod-b', command: (editor) => editor.chain().toggleBold().run() },
  ],
});

const Link = defineExtension({
  name: 'link',
  marks: [{
    name: 'link',
    attrs: {
      href: { type: 'string', required: true },
      target: { type: 'string', default: '_blank' },
    },
    rank: 60,
  }],
});
```

### 3.2. Plugin -> Extension

| ProseMirror Plugin | GoTipe Extension | Approach |
|-------------------|-----------------|----------|
| `Plugin` with `state` | `defineExtension` with `plugin()` | Plugin factory in the extension |
| `keymap()` | `keybindings: [...]` | Declarative keybindings |
| `inputRules()` | `inputRules: [...]` | Declarative input rules |
| `history()` | `History` extension | Built in |
| `dropCursor()` | `DragAndDrop` extension | Built in |
| `gapCursor()` | Built into the core | Automatic |
| `collab()` | `Collaboration` extension | CRDT instead of OT |
| Custom decorations | `plugin()` with `decorations` | Via the extension plugin |

**ProseMirror Plugin (before):**

```typescript
import { Plugin, PluginKey } from 'prosemirror-state';

const wordCountKey = new PluginKey('wordCount');

const wordCountPlugin = new Plugin({
  key: wordCountKey,
  state: {
    init(_, state) {
      return countWords(state.doc);
    },
    apply(tr, value, oldState, newState) {
      if (tr.docChanged) {
        return countWords(newState.doc);
      }
      return value;
    },
  },
});
```

**GoTipe Extension (after):**

```typescript
import { defineExtension } from '@gotipe/core';

const WordCount = defineExtension({
  name: 'wordCount',
  plugin: () => ({
    state: {
      init: (state) => countWords(state),
      apply: (tr, value, oldState, newState) => {
        if (tr.docChanged) {
          return countWords(newState);
        }
        return value;
      },
    },
  }),
});

// Or more simply, via the useEditorState hook:
const wordCount = useEditorState(editor, (state) =>
  state.blocks.reduce((acc, block) => {
    if (Array.isArray(block.content)) {
      return acc + block.content.reduce(
        (a, span) => a + span.text.split(/\s+/).filter(Boolean).length, 0
      );
    }
    return acc;
  }, 0)
);
```

### 3.3. Transaction/Transform

| ProseMirror | GoTipe | Differences |
|------------|--------|-------------|
| `tr.insertText('hello', pos)` | `Step::InsertText { block_id, offset, text, marks }` | Block-based instead of position-based |
| `tr.delete(from, to)` | `Step::DeleteText { block_id, from, to }` | Offset within the block |
| `tr.setNodeMarkup(pos, type, attrs)` | `Step::SetBlockType { block_id, new_type, attrs }` | By block ID |
| `tr.addMark(from, to, mark)` | `Step::AddMark { block_id, from, to, mark }` | Within a single block |
| `tr.split(pos)` | `Step::SplitBlock { block_id, offset }` | By block ID |
| `tr.join(pos)` | `Step::MergeBlocks { block_id, target_id }` | Two block IDs |
| Position-based addressing | Block ID + offset addressing | The main difference |

### 3.4. View Layer

The ProseMirror EditorView is replaced by a framework adapter:

```typescript
// Before (ProseMirror):
import { EditorView } from 'prosemirror-view';

const view = new EditorView(document.getElementById('editor'), {
  state: EditorState.create({ schema, plugins }),
  dispatchTransaction(tr) {
    const newState = view.state.apply(tr);
    view.updateState(newState);
  },
  nodeViews: {
    image(node, view, getPos) {
      return new ImageNodeView(node, view, getPos);
    },
  },
});

// After (GoTipe + React):
import { useEditor, Editor } from '@gotipe/react';

const editor = useEditor({
  extensions: DefaultPreset,
  content: document,
  onUpdate: ({ editor }) => console.log(editor.getJSON()),
});

return (
  <Editor
    editor={editor}
    blockRenderer={({ block, children }) => {
      if (block.type === 'image') {
        return <CustomImage block={block} />;
      }
      return null;
    }}
  />
);
```

---

## 4. Migrating from Lexical

Lexical (Meta) is a React-first editor with its own node model. Migration requires rethinking the node structure.

### 4.1. Node Model

| Aspect | Lexical | GoTipe |
|--------|---------|--------|
| Node type | Class-based (`ElementNode`, `TextNode`, `DecoratorNode`) | Data-driven (JSON block) |
| Node identity | Unique key (auto-generated) | Block `id` (string) |
| Text formatting | Bitmask flags (`IS_BOLD = 1`, `IS_ITALIC = 2`) | Marks array |
| Tree structure | Generic `ElementNode` with children | `Block` with `content` (text) and `children` (nested blocks) |
| Immutability | Mutable nodes in the reconciler | Immutable EditorState with transactions |
| State updates | `editor.update(() => { ... })` | `editor.chain().toggleBold().run()` |

**Lexical Node (before):**

```typescript
import {
  $getRoot,
  $createParagraphNode,
  $createTextNode,
  LexicalEditor,
} from 'lexical';
import { $createHeadingNode } from '@lexical/rich-text';

editor.update(() => {
  const root = $getRoot();
  const heading = $createHeadingNode('h1');
  heading.append($createTextNode('Hello World'));
  root.append(heading);

  const paragraph = $createParagraphNode();
  const bold = $createTextNode('Bold text').toggleFormat('bold');
  paragraph.append(bold);
  root.append(paragraph);
});
```

**GoTipe (after):**

```typescript
import { createEditor } from '@gotipe/core';
import { DefaultPreset } from '@gotipe/core/presets';

const editor = await createEditor({
  extensions: DefaultPreset,
});

editor.chain()
  .insertBlockAfter('heading', { level: 1 })
  .insertText('Hello World')
  .insertBlockAfter('paragraph')
  .insertText('Bold text')
  .toggleBold()
  .run();
```

### 4.2. Plugin -> Extension

| Lexical Plugin/Module | GoTipe Extension | Differences |
|----------------------|-----------------|-------------|
| `RichTextPlugin` | `DefaultPreset` | Built in |
| `HistoryPlugin` | `History` | Built into the preset |
| `ListPlugin` | `BulletList`, `OrderedList` | Separate extensions |
| `LinkPlugin` | `Link` | 1:1 |
| `TablePlugin` | `Table` | 1:1 |
| `CodeHighlightPlugin` | `CodeBlock` | Syntax highlighting in `.configure()` |
| `AutoFocusPlugin` | `autofocus` option | A useEditor parameter |
| `OnChangePlugin` | `onUpdate` callback | A useEditor parameter |
| `CollaborationPlugin` (Yjs) | `Collaboration` | GoTipe CRDT (+ Yjs adapter) |
| `CheckListPlugin` | `TodoList` | 1:1 |
| `MarkdownShortcutPlugin` | Input rules in extensions | Automatically from extensions |
| `TabIndentationPlugin` | Built into `ListItem` | Automatic |
| Custom `DecoratorNode` | Custom extension with `blockRenderer` | Data-driven approach |

### 4.3. React Hook

**Lexical React (before):**

```tsx
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

const theme = { /* ... */ };
const initialConfig = {
  namespace: 'MyEditor',
  theme,
  onError: console.error,
  nodes: [HeadingNode, ListNode, ListItemNode, QuoteNode, CodeNode],
};

function MyEditor() {
  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="editor-container">
        <ToolbarPlugin />
        <RichTextPlugin
          contentEditable={<ContentEditable className="editor-input" />}
          placeholder={<div className="editor-placeholder">Type here...</div>}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <OnChangePlugin onChange={(state) => console.log(state.toJSON())} />
      </div>
    </LexicalComposer>
  );
}
```

**GoTipe React (after):**

```tsx
import { useEditor, Editor } from '@gotipe/react';
import { DefaultPreset } from '@gotipe/core/presets';
import { Placeholder } from '@gotipe/core/extensions';

function MyEditor() {
  const editor = useEditor({
    extensions: [
      ...DefaultPreset,
      Placeholder.configure({ text: 'Type here...' }),
    ],
    onUpdate: ({ editor }) => console.log(editor.getJSON()),
  });

  if (!editor) return null;

  return (
    <Editor
      editor={editor}
      className="editor-container"
      slotBefore={<Toolbar editor={editor} />}
    />
  );
}
```

### 4.4. Collaboration

**Lexical + Yjs (before):**

```typescript
import { CollaborationPlugin } from '@lexical/react/LexicalCollaborationPlugin';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

<CollaborationPlugin
  id="doc-123"
  providerFactory={(id, yjsDocMap) => {
    const doc = new Y.Doc();
    yjsDocMap.set(id, doc);
    return new WebsocketProvider('wss://server.com', id, doc);
  }}
  shouldBootstrap={true}
/>
```

**GoTipe (after):**

```typescript
import { Collaboration } from '@gotipe/collaboration';
import { GoTipeProvider } from '@gotipe/collaboration';

const editor = useEditor({
  extensions: [
    ...DefaultPreset,
    Collaboration.configure({
      provider: new GoTipeProvider({
        url: 'wss://sync.gotipe.com',
        documentId: 'doc-123',
      }),
    }),
  ],
});
```

---

## 5. Migrating from Slate

Slate is a flexible React framework with a tree-based document model. GoTipe offers a more structured approach.

### 5.1. Document Model

**Slate Document (before):**

```json
[
  {
    "type": "heading",
    "level": 1,
    "children": [
      { "text": "Hello World" }
    ]
  },
  {
    "type": "paragraph",
    "children": [
      { "text": "This is " },
      { "text": "bold", "bold": true },
      { "text": " text." }
    ]
  },
  {
    "type": "bullet-list",
    "children": [
      {
        "type": "list-item",
        "children": [{ "text": "Item 1" }]
      }
    ]
  }
]
```

**GoTipe Document (after):**

```json
{
  "version": 1,
  "blocks": [
    {
      "id": "b1",
      "type": "heading",
      "attrs": { "level": 1 },
      "content": [{ "text": "Hello World", "marks": [] }],
      "children": []
    },
    {
      "id": "b2",
      "type": "paragraph",
      "attrs": {},
      "content": [
        { "text": "This is ", "marks": [] },
        { "text": "bold", "marks": [{ "type": "bold" }] },
        { "text": " text.", "marks": [] }
      ],
      "children": []
    },
    {
      "id": "b3",
      "type": "bulletList",
      "attrs": {},
      "content": [],
      "children": [
        {
          "id": "b4",
          "type": "listItem",
          "attrs": {},
          "content": [{ "text": "Item 1", "marks": [] }],
          "children": []
        }
      ]
    }
  ]
}
```

**Key differences:**

| Aspect | Slate | GoTipe |
|--------|-------|--------|
| Root | An array of nodes | `{ version, blocks }` |
| Text formatting | Properties on the text node (`{ bold: true }`) | Marks array (`[{ type: "bold" }]`) |
| Attributes | Flat on the node (`{ level: 1 }`) | In the `attrs` object |
| Identity | Path-based (`[0, 1, 2]`) | Block ID (`"b123"`) |
| Custom props | Any properties on the node | Typed `attrs` via the schema |

### 5.2. Converting Slate -> GoTipe

```typescript
// packages/migration/src/slate-to-gotipe.ts

import { v4 as uuid } from 'uuid';

interface SlateNode {
  type?: string;
  children?: SlateNode[];
  text?: string;
  [key: string]: unknown;
}

export function convertSlateToGoTipe(slateNodes: SlateNode[]): GoTipeDocument {
  return {
    version: 1,
    blocks: slateNodes.map(node => convertSlateNode(node)),
  };
}

function convertSlateNode(node: SlateNode): GoTipeBlock {
  // Text leaf: not converted separately
  if (node.text !== undefined) {
    throw new Error('Text nodes should be handled by parent');
  }

  const block: GoTipeBlock = {
    id: uuid(),
    type: mapSlateType(node.type ?? 'paragraph'),
    attrs: extractAttrs(node),
    content: [],
    children: [],
  };

  if (node.children) {
    const textChildren = node.children.filter(c => c.text !== undefined);
    const blockChildren = node.children.filter(c => c.text === undefined);

    // Text children -> content
    if (textChildren.length > 0) {
      block.content = textChildren.map(c => ({
        text: c.text ?? '',
        marks: extractMarks(c),
      }));
    }

    // Block children -> children
    if (blockChildren.length > 0) {
      block.children = blockChildren.map(c => convertSlateNode(c));
    }
  }

  return block;
}

function extractMarks(textNode: SlateNode): Array<{ type: string; attrs?: Record<string, unknown> }> {
  const marks: Array<{ type: string; attrs?: Record<string, unknown> }> = [];
  if (textNode.bold) marks.push({ type: 'bold' });
  if (textNode.italic) marks.push({ type: 'italic' });
  if (textNode.underline) marks.push({ type: 'underline' });
  if (textNode.strikethrough) marks.push({ type: 'strikethrough' });
  if (textNode.code) marks.push({ type: 'code' });
  if (textNode.href) marks.push({ type: 'link', attrs: { href: textNode.href } });
  return marks;
}

function extractAttrs(node: SlateNode): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  const skip = ['type', 'children', 'text', 'bold', 'italic', 'underline',
                 'strikethrough', 'code', 'href'];
  for (const [key, value] of Object.entries(node)) {
    if (!skip.includes(key)) {
      attrs[key] = value;
    }
  }
  return attrs;
}

function mapSlateType(type: string): string {
  const mapping: Record<string, string> = {
    'paragraph': 'paragraph',
    'heading': 'heading',
    'heading-one': 'heading',
    'heading-two': 'heading',
    'bullet-list': 'bulletList',
    'bulleted-list': 'bulletList',
    'numbered-list': 'orderedList',
    'ordered-list': 'orderedList',
    'list-item': 'listItem',
    'code-block': 'codeBlock',
    'block-quote': 'blockquote',
    'image': 'image',
    'table': 'table',
    'table-row': 'tableRow',
    'table-cell': 'tableCell',
    'divider': 'divider',
  };
  return mapping[type] ?? type;
}
```

### 5.3. React Integration

**Slate React (before):**

```tsx
import { Slate, Editable, withReact } from 'slate-react';
import { createEditor, Transforms, Editor } from 'slate';

function MyEditor() {
  const [editor] = useState(() => withReact(createEditor()));
  const [value, setValue] = useState(initialValue);

  const renderElement = useCallback(({ attributes, children, element }) => {
    switch (element.type) {
      case 'heading': return <h1 {...attributes}>{children}</h1>;
      default: return <p {...attributes}>{children}</p>;
    }
  }, []);

  const renderLeaf = useCallback(({ attributes, children, leaf }) => {
    if (leaf.bold) children = <strong>{children}</strong>;
    if (leaf.italic) children = <em>{children}</em>;
    return <span {...attributes}>{children}</span>;
  }, []);

  return (
    <Slate editor={editor} initialValue={value} onChange={setValue}>
      <Editable
        renderElement={renderElement}
        renderLeaf={renderLeaf}
        onKeyDown={(event) => {
          if (event.ctrlKey && event.key === 'b') {
            event.preventDefault();
            Editor.addMark(editor, 'bold', true);
          }
        }}
      />
    </Slate>
  );
}
```

**GoTipe React (after):**

```tsx
import { useEditor, Editor } from '@gotipe/react';
import { DefaultPreset } from '@gotipe/core/presets';

function MyEditor() {
  const editor = useEditor({
    extensions: DefaultPreset,
    content: convertSlateToGoTipe(initialValue),
    onUpdate: ({ editor }) => {
      // GoTipe JSON instead of a Slate value
      console.log(editor.getJSON());
    },
  });

  if (!editor) return null;

  return (
    <Editor
      editor={editor}
      blockRenderer={({ block, children }) => {
        // Custom rendering if needed
        if (block.type === 'heading') {
          const Tag = `h${block.attrs.level}` as keyof JSX.IntrinsicElements;
          return <Tag className="custom-heading">{children}</Tag>;
        }
        return null; // default renderer
      }}
    />
  );
}
```

---

## 6. Migrating from CKEditor / TinyMCE

CKEditor and TinyMCE are legacy WYSIWYG editors that work with HTML directly. Migration is simpler because GoTipe supports HTML import.

### 6.1. Content Format Conversion

**CKEditor / TinyMCE (HTML -> GoTipe JSON):**

```typescript
import { createEditor } from '@gotipe/core';
import { DefaultPreset } from '@gotipe/core/presets';

// CKEditor stores HTML
const ckeditorContent = `
  <h1>My Article</h1>
  <p>This is <strong>bold</strong> and <em>italic</em> text.</p>
  <ul>
    <li>Item 1</li>
    <li>Item 2</li>
  </ul>
  <table>
    <tr><th>Name</th><th>Value</th></tr>
    <tr><td>A</td><td>1</td></tr>
  </table>
`;

// GoTipe imports HTML directly
const editor = await createEditor({
  extensions: DefaultPreset,
  content: ckeditorContent, // an HTML string: imported automatically
});

// Or an explicit import:
editor.setContent(ckeditorContent);
const gotipeJson = editor.getJSON(); // GoTipe JSON to save
```

### 6.2. Batch Conversion from a Database

```typescript
// scripts/migrate-ckeditor-to-gotipe.ts

import { createHeadlessEditor } from '@gotipe/core/server';
import { DefaultPreset } from '@gotipe/core/presets';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrateAll() {
  const editor = await createHeadlessEditor({ extensions: DefaultPreset });

  const { rows } = await pool.query('SELECT id, html_content FROM articles');

  for (const row of rows) {
    try {
      // 1. Import the HTML
      editor.setContent(row.html_content);

      // 2. Validate
      const validation = editor.validate(editor.getJSON());
      if (!validation.valid) {
        console.warn(`Document ${row.id}: validation warnings`, validation.errors);
      }

      // 3. Save the GoTipe JSON
      const gotipeJson = JSON.stringify(editor.getJSON());
      await pool.query(
        'UPDATE articles SET gotipe_content = $1 WHERE id = $2',
        [gotipeJson, row.id]
      );

      console.log(`Migrated: ${row.id}`);
    } catch (err) {
      console.error(`Failed: ${row.id}`, err);
    }
  }

  editor.destroy();
}

migrateAll();
```

### 6.3. Plugin / Toolbar Mapping

| CKEditor 5 Plugin | GoTipe Extension |
|-------------------|-----------------|
| `@ckeditor/ckeditor5-essentials` | `DefaultPreset` |
| `@ckeditor/ckeditor5-paragraph` | `Paragraph` (in the preset) |
| `@ckeditor/ckeditor5-heading` | `Heading` (in the preset) |
| `@ckeditor/ckeditor5-bold` | `Bold` (in the preset) |
| `@ckeditor/ckeditor5-italic` | `Italic` (in the preset) |
| `@ckeditor/ckeditor5-link` | `Link` (in the preset) |
| `@ckeditor/ckeditor5-list` | `BulletList`, `OrderedList` (in the preset) |
| `@ckeditor/ckeditor5-image` | `Image` |
| `@ckeditor/ckeditor5-table` | `Table` |
| `@ckeditor/ckeditor5-code-block` | `CodeBlock` |
| `@ckeditor/ckeditor5-block-quote` | `Blockquote` |
| `@ckeditor/ckeditor5-media-embed` | `Embed` |
| `@ckeditor/ckeditor5-alignment` | `TextAlign` |
| `@ckeditor/ckeditor5-highlight` | `Highlight` |
| `@ckeditor/ckeditor5-font` | `TextColor`, `FontFamily` |
| `@ckeditor/ckeditor5-horizontal-line` | `Divider` |
| `@ckeditor/ckeditor5-find-and-replace` | `FindAndReplace` |
| `@ckeditor/ckeditor5-mention` | `Mention` (`@gotipe/ext-mention`) |
| `@ckeditor/ckeditor5-real-time-collaboration` | `Collaboration` (`@gotipe/collaboration`) |
| `@ckeditor/ckeditor5-export-pdf` | `exportDocument(editor, 'pdf')` |
| `@ckeditor/ckeditor5-export-word` | `exportDocument(editor, 'docx')` |

| TinyMCE Plugin | GoTipe Extension |
|---------------|-----------------|
| `lists` | `BulletList`, `OrderedList` |
| `link` | `Link` |
| `image` | `Image` |
| `table` | `Table` |
| `code` | `InlineCode` |
| `codesample` | `CodeBlock` |
| `media` | `Embed` |
| `wordcount` | `CharacterCount` |
| `searchreplace` | `FindAndReplace` |
| `emoticons` | `Emoji` (`@gotipe/ext-emoji`) |

### 6.4. Configuration Mapping

**CKEditor 5 (before):**

```typescript
import ClassicEditor from '@ckeditor/ckeditor5-editor-classic/src/classiceditor';

ClassicEditor.create(document.querySelector('#editor'), {
  toolbar: ['heading', '|', 'bold', 'italic', 'link', '|', 'bulletedList', 'numberedList'],
  heading: {
    options: [
      { model: 'paragraph', title: 'Paragraph' },
      { model: 'heading1', view: 'h1', title: 'Heading 1' },
      { model: 'heading2', view: 'h2', title: 'Heading 2' },
    ],
  },
  image: {
    upload: { types: ['jpeg', 'png', 'gif'] },
  },
});
```

**GoTipe (after):**

```typescript
import { useEditor, Editor } from '@gotipe/react';
import { Paragraph, Heading, Bold, Italic, Link,
         BulletList, OrderedList, Image, History } from '@gotipe/core/extensions';

const editor = useEditor({
  extensions: [
    Paragraph,
    Heading.configure({ levels: [1, 2] }),
    Bold,
    Italic,
    Link,
    BulletList,
    OrderedList,
    Image.configure({
      allowedTypes: ['image/jpeg', 'image/png', 'image/gif'],
      upload: async (file) => {
        // Your upload handler
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const { url } = await res.json();
        return url;
      },
    }),
    History,
  ],
  content: existingHtmlContent,
});

// Toolbar: a React component, full freedom to customize
return (
  <Editor
    editor={editor}
    slotBefore={<Toolbar editor={editor} />}
  />
);
```

---

## 7. Content Conversion (detailed guide)

### 7.1. ProseMirror JSON -> GoTipe JSON (TypeScript utility)

The full converter implementation is described in section 2.8. Installation:

```bash
npm install @gotipe/migration
```

```typescript
import { convertProseMirrorToGoTipe } from '@gotipe/migration';

const tiptapDoc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }
  ]
};

const gotipeDoc = convertProseMirrorToGoTipe(tiptapDoc);
// { version: 1, blocks: [{ id: '...', type: 'paragraph', ... }] }
```

### 7.2. HTML -> GoTipe JSON

Use the `gotipe-export` importer (Rust/WASM):

```typescript
import { createHeadlessEditor } from '@gotipe/core/server';
import { DefaultPreset } from '@gotipe/core/presets';

const editor = await createHeadlessEditor({ extensions: DefaultPreset });

// Option 1: setContent with an HTML string
editor.setContent('<p>Hello <strong>World</strong></p>');
const doc = editor.getJSON();

// Option 2: the import function
import { importDocument } from '@gotipe/core/export';
await importDocument(editor, htmlString, 'html', {
  sanitize: true,   // XSS prevention
  strict: false,     // Ignore unknown elements
  maxBlocks: 10000,  // Block limit
});
```

### 7.3. Markdown -> GoTipe JSON

```typescript
const editor = await createHeadlessEditor({ extensions: DefaultPreset });

// Markdown -> GoTipe JSON (via WASM, CommonMark + GFM)
editor.setContent(`
# Hello World

This is **bold** and *italic* text.

- Item 1
- Item 2
  - Nested

\`\`\`typescript
const x = 42;
\`\`\`
`);

const doc = editor.getJSON();
```

Supported Markdown extensions:

- CommonMark (full support)
- GFM Tables
- GFM Task Lists (`- [x] done`)
- GFM Strikethrough (`~~text~~`)
- GFM Autolinks
- GoTipe Callout (`> [!note] Title` -- Obsidian-compatible)
- GoTipe Math (`$$LaTeX$$`)
- GoTipe Highlight (`==text==`)

More in [08-export-import.md](08-export-import.md).

### 7.4. Notion Export -> GoTipe JSON

Notion exports data as a ZIP archive of Markdown files:

```typescript
// scripts/import-notion.ts
import { createHeadlessEditor } from '@gotipe/core/server';
import { DefaultPreset } from '@gotipe/core/presets';
import { importDocument } from '@gotipe/core/export';
import AdmZip from 'adm-zip';
import path from 'path';

async function importNotionExport(zipPath: string): Promise<Map<string, object>> {
  const editor = await createHeadlessEditor({ extensions: DefaultPreset });
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  const documents = new Map<string, object>();

  for (const entry of entries) {
    if (!entry.entryName.endsWith('.md')) continue;

    const markdown = entry.getData().toString('utf8');
    const title = path.basename(entry.entryName, '.md')
      .replace(/ [a-f0-9]{32}$/, ''); // Strip the Notion UUID from the name

    // Notion Markdown -> GoTipe JSON
    await importDocument(editor, markdown, 'markdown', {
      sanitize: false,
      strict: false,
    });

    documents.set(title, editor.getJSON());
    console.log(`Imported: ${title}`);
  }

  editor.destroy();
  return documents;
}
```

### 7.5. Batch Conversion Scripts

**Bulk conversion script (PostgreSQL):**

```typescript
// scripts/batch-convert.ts

import { createHeadlessEditor } from '@gotipe/core/server';
import { DefaultPreset } from '@gotipe/core/presets';
import { convertProseMirrorToGoTipe } from '@gotipe/migration';
import { Pool } from 'pg';

interface ConversionResult {
  total: number;
  success: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}

async function batchConvert(options: {
  sourceFormat: 'prosemirror' | 'html' | 'markdown';
  sourceColumn: string;
  targetColumn: string;
  table: string;
  batchSize: number;
}): Promise<ConversionResult> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const editor = await createHeadlessEditor({ extensions: DefaultPreset });

  const result: ConversionResult = { total: 0, success: 0, failed: 0, errors: [] };

  // Pagination
  let offset = 0;
  while (true) {
    const { rows } = await pool.query(
      `SELECT id, ${options.sourceColumn} FROM ${options.table}
       WHERE ${options.targetColumn} IS NULL
       ORDER BY id LIMIT $1 OFFSET $2`,
      [options.batchSize, offset]
    );

    if (rows.length === 0) break;

    for (const row of rows) {
      result.total++;
      try {
        let gotipeJson: object;

        switch (options.sourceFormat) {
          case 'prosemirror':
            gotipeJson = convertProseMirrorToGoTipe(
              typeof row[options.sourceColumn] === 'string'
                ? JSON.parse(row[options.sourceColumn])
                : row[options.sourceColumn]
            );
            break;

          case 'html':
            editor.setContent(row[options.sourceColumn]);
            gotipeJson = editor.getJSON();
            break;

          case 'markdown':
            editor.setContent(row[options.sourceColumn]);
            gotipeJson = editor.getJSON();
            break;
        }

        await pool.query(
          `UPDATE ${options.table} SET ${options.targetColumn} = $1 WHERE id = $2`,
          [JSON.stringify(gotipeJson), row.id]
        );
        result.success++;
      } catch (err) {
        result.failed++;
        result.errors.push({ id: row.id, error: (err as Error).message });
      }
    }

    offset += options.batchSize;
    console.log(`Progress: ${result.total} processed, ${result.success} success, ${result.failed} failed`);
  }

  editor.destroy();
  await pool.end();
  return result;
}

// Usage:
batchConvert({
  sourceFormat: 'prosemirror',
  sourceColumn: 'tiptap_json',
  targetColumn: 'gotipe_json',
  table: 'documents',
  batchSize: 100,
}).then(result => {
  console.log('Migration complete:', result);
  if (result.errors.length > 0) {
    console.log('Errors:', JSON.stringify(result.errors, null, 2));
  }
});
```

---

## 8. Collaboration Migration

### 8.1. Yjs -> GoTipe CRDT (Adapter Pattern)

The recommended approach is a gradual migration using the Yjs Compatibility Adapter:

**Phase 1: GoTipe editor + Yjs backend (existing)**

```typescript
// Step 1: Replace Tiptap with GoTipe, keeping Yjs
import { Collaboration } from '@gotipe/collaboration';
import { YjsAdapter } from '@gotipe/collaboration/adapters/yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';

const hocuspocus = new HocuspocusProvider({
  url: 'wss://your-existing-hocuspocus.com',
  name: documentId,
});

const editor = useEditor({
  extensions: [
    ...DefaultPreset,
    Collaboration.configure({
      provider: new YjsAdapter(hocuspocus),
    }),
  ],
});
```

**Phase 2: Dual-write (parallel run)**

```typescript
// Step 2: Write to both backends at the same time
import { DualProvider } from '@gotipe/collaboration/migration';

const dualProvider = new DualProvider({
  primary: new YjsAdapter(hocuspocus),       // Yjs (production)
  secondary: new GoTipeProvider({             // GoTipe CRDT (shadow)
    url: 'wss://new-gotipe-sync.com',
    documentId,
  }),
  mode: 'shadow', // secondary receives writes but is not read
});
```

**Phase 3: Switch to the GoTipe CRDT**

```typescript
// Step 3: GoTipe CRDT as primary
const editor = useEditor({
  extensions: [
    ...DefaultPreset,
    Collaboration.configure({
      provider: new GoTipeProvider({
        url: 'wss://sync.gotipe.com',
        documentId: 'doc-123',
      }),
    }),
  ],
});
```

### 8.2. Liveblocks -> GoTipe Cloud

```typescript
// Before (Liveblocks):
import { createClient } from '@liveblocks/client';
import { useRoom, RoomProvider } from '@liveblocks/react';

const client = createClient({ publicApiKey: 'pk_...' });

// Tiptap + Liveblocks
<RoomProvider id="doc-123">
  <TiptapEditor />
</RoomProvider>

// After (GoTipe Cloud):
import { Collaboration } from '@gotipe/collaboration';
import { GoTipeCloudProvider } from '@gotipe/cloud';

const editor = useEditor({
  extensions: [
    ...DefaultPreset,
    Collaboration.configure({
      provider: new GoTipeCloudProvider({
        appId: 'your-app-id',
        documentId: 'doc-123',
        auth: async () => {
          const res = await fetch('/api/gotipe-auth');
          return res.json(); // { token: '...' }
        },
      }),
    }),
  ],
});
```

More on GoTipe Cloud in [10-cloud.md](10-cloud.md).

### 8.3. Custom WebSocket -> GoTipe Provider

If you have your own WebSocket server for collaboration, implement the `CollaborationProvider` interface:

```typescript
import type { CollaborationProvider } from '@gotipe/collaboration';

class CustomProvider implements CollaborationProvider {
  private ws: WebSocket | null = null;
  private updateCallbacks: Array<(update: Uint8Array) => void> = [];
  private awarenessCallbacks: Array<(state: Uint8Array) => void> = [];
  private statusCallbacks: Array<(status: 'connected' | 'connecting' | 'disconnected') => void> = [];

  constructor(private url: string) {}

  connect(documentId: string): void {
    this.ws = new WebSocket(`${this.url}/ws/${documentId}`);
    this.ws.binaryType = 'arraybuffer';
    this.statusCallbacks.forEach(cb => cb('connecting'));

    this.ws.onopen = () => {
      this.statusCallbacks.forEach(cb => cb('connected'));
    };

    this.ws.onmessage = (event) => {
      const data = new Uint8Array(event.data);
      const msgType = data[0];

      if (msgType === 0x03) { // Update
        this.updateCallbacks.forEach(cb => cb(data));
      } else if (msgType === 0x04) { // Awareness
        this.awarenessCallbacks.forEach(cb => cb(data));
      }
    };

    this.ws.onclose = () => {
      this.statusCallbacks.forEach(cb => cb('disconnected'));
    };
  }

  disconnect(): void { this.ws?.close(); }
  sendUpdate(update: Uint8Array): void { this.ws?.send(update); }
  sendAwareness(state: Uint8Array): void { this.ws?.send(state); }
  onUpdate(callback: (update: Uint8Array) => void): void { this.updateCallbacks.push(callback); }
  onAwareness(callback: (state: Uint8Array) => void): void { this.awarenessCallbacks.push(callback); }
  onStatus(callback: (status: 'connected' | 'connecting' | 'disconnected') => void): void {
    this.statusCallbacks.push(callback);
  }
  destroy(): void { this.disconnect(); }
}

// Usage:
const editor = useEditor({
  extensions: [
    ...DefaultPreset,
    Collaboration.configure({
      provider: new CustomProvider('wss://your-server.com'),
    }),
  ],
});
```

The GoTipe sync protocol (binary) is described in [02-collaboration.md#sync-protocol](02-collaboration.md#sync-protocol).

---

## 9. Testing Migration

### 9.1. Content Parity Tests

Make sure the content conversion does not lose data:

```typescript
// tests/migration/content-parity.test.ts

import { describe, it, expect } from 'vitest';
import { createHeadlessEditor } from '@gotipe/core/server';
import { DefaultPreset } from '@gotipe/core/presets';
import { convertProseMirrorToGoTipe } from '@gotipe/migration';

describe('Content Parity: Tiptap -> GoTipe', () => {
  let editor: HeadlessEditor;

  beforeAll(async () => {
    editor = await createHeadlessEditor({ extensions: DefaultPreset });
  });

  afterAll(() => editor.destroy());

  it('preserves heading levels', () => {
    const pmDoc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 },
          content: [{ type: 'text', text: 'Title' }] },
      ],
    };

    const gotipeDoc = convertProseMirrorToGoTipe(pmDoc);
    expect(gotipeDoc.blocks[0].type).toBe('heading');
    expect(gotipeDoc.blocks[0].attrs.level).toBe(2);
    expect(gotipeDoc.blocks[0].content[0].text).toBe('Title');
  });

  it('preserves marks', () => {
    const pmDoc = {
      type: 'doc',
      content: [
        { type: 'paragraph',
          content: [
            { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' and ', marks: [] },
            { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
          ],
        },
      ],
    };

    const gotipeDoc = convertProseMirrorToGoTipe(pmDoc);
    const content = gotipeDoc.blocks[0].content;

    expect(content[0].text).toBe('bold');
    expect(content[0].marks[0].type).toBe('bold');
    expect(content[1].text).toBe(' and ');
    expect(content[1].marks).toHaveLength(0);
    expect(content[2].text).toBe('italic');
    expect(content[2].marks[0].type).toBe('italic');
  });

  it('preserves nested lists', () => {
    const pmDoc = {
      type: 'doc',
      content: [
        { type: 'bulletList',
          content: [
            { type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Item 1' }] },
                { type: 'bulletList',
                  content: [
                    { type: 'listItem',
                      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nested' }] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const gotipeDoc = convertProseMirrorToGoTipe(pmDoc);
    const list = gotipeDoc.blocks[0];
    expect(list.type).toBe('bulletList');
    expect(list.children[0].type).toBe('listItem');
    expect(list.children[0].children[0].type).toBe('bulletList');
  });

  it('HTML round-trip preserves content', async () => {
    const html = '<h1>Title</h1><p>Text with <strong>bold</strong></p>';
    editor.setContent(html);
    const exportedHtml = editor.getHTML();

    // Re-import and compare
    editor.setContent(exportedHtml);
    const json = editor.getJSON();

    expect(json.blocks[0].type).toBe('heading');
    expect(json.blocks[1].type).toBe('paragraph');
    expect(json.blocks[1].content[1].marks[0].type).toBe('bold');
  });
});
```

### 9.2. Feature Parity Checklist

Use this checklist to verify the migration:

```markdown
## Feature Parity Checklist

### Text Formatting
- [ ] Bold (Cmd/Ctrl+B)
- [ ] Italic (Cmd/Ctrl+I)
- [ ] Underline (Cmd/Ctrl+U)
- [ ] Strikethrough (Cmd/Ctrl+Shift+S)
- [ ] Inline code (Cmd/Ctrl+E)
- [ ] Link (Cmd/Ctrl+K)
- [ ] Highlight
- [ ] Superscript / Subscript

### Block Types
- [ ] Paragraph
- [ ] Heading (H1-H6)
- [ ] Bullet list (with nesting)
- [ ] Ordered list (with nesting)
- [ ] Task list (checkboxes)
- [ ] Code block (with syntax highlighting)
- [ ] Blockquote
- [ ] Image (upload + paste)
- [ ] Table (insert, resize, merge cells)
- [ ] Divider / Horizontal rule
- [ ] Callout / Admonition

### UX Features
- [ ] Slash commands (/)
- [ ] Markdown shortcuts (# , ** , - , etc.)
- [ ] Drag and drop blocks
- [ ] Placeholder text
- [ ] Auto-linking URLs
- [ ] Paste HTML content
- [ ] Paste from Google Docs
- [ ] Paste images
- [ ] Undo / Redo
- [ ] Keyboard navigation

### Collaboration
- [ ] Real-time sync
- [ ] Remote cursors (awareness)
- [ ] Offline support
- [ ] Conflict resolution
- [ ] Presence indicators

### Export / Import
- [ ] Export HTML
- [ ] Export Markdown
- [ ] Export PDF
- [ ] Export DOCX
- [ ] Import HTML
- [ ] Import Markdown
- [ ] Import DOCX

### Custom Features
- [ ] Custom extensions (if you had any)
- [ ] Custom NodeViews / block renderers
- [ ] Custom toolbar buttons
- [ ] Custom slash commands
- [ ] API integrations
```

### 9.3. Performance Comparison

```typescript
// tests/migration/performance.bench.ts

import { bench, describe } from 'vitest';
import { createHeadlessEditor } from '@gotipe/core/server';

describe('Performance Comparison', () => {
  // Generate a test document
  const largeDoc = generateLargeDocument(10000); // 10K blocks

  bench('GoTipe: parse 10K blocks from JSON', async () => {
    const editor = await createHeadlessEditor({ extensions: DefaultPreset });
    editor.setContent(largeDoc);
    editor.destroy();
  });

  bench('GoTipe: export HTML (10K blocks)', async () => {
    const editor = await createHeadlessEditor({ extensions: DefaultPreset });
    editor.setContent(largeDoc);
    editor.getHTML();
    editor.destroy();
  });

  bench('GoTipe: 1000 sequential inserts', async () => {
    const editor = await createHeadlessEditor({ extensions: DefaultPreset });
    for (let i = 0; i < 1000; i++) {
      editor.chain().insertText(`Word ${i} `).run();
    }
    editor.destroy();
  });
});
```

Target performance (from [01-architecture.md#performance](01-architecture.md#performance)):

| Operation | ProseMirror (JS) | GoTipe (WASM) | Speedup |
|-----------|------------------|---------------|---------|
| Parse 10K blocks from JSON | ~120ms | ~25ms | 4.8x |
| Apply 1000 sequential inserts | ~85ms | ~18ms | 4.7x |
| Schema validation (10K blocks) | ~45ms | ~8ms | 5.6x |
| HTML export (10K blocks) | ~95ms | ~22ms | 4.3x |
| CRDT merge (1000 ops) | ~180ms (Yjs) | ~90ms | 2.0x |

### 9.4. Accessibility Regression Testing

```typescript
// tests/migration/a11y.test.ts

import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

test.describe('Accessibility', () => {
  test('editor passes axe checks', async ({ page }) => {
    await page.goto('/editor');

    // Wait for WASM load
    await page.waitForSelector('.gotipe-editor[contenteditable="true"]');

    const results = await new AxeBuilder({ page })
      .include('.gotipe-editor')
      .analyze();

    expect(results.violations).toHaveLength(0);
  });

  test('keyboard navigation works', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForSelector('.gotipe-editor[contenteditable="true"]');

    // Tab to editor
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() =>
      document.activeElement?.closest('.gotipe-editor') !== null
    );
    expect(focused).toBe(true);

    // Type and format
    await page.keyboard.type('Hello ');
    await page.keyboard.press('Control+b');
    await page.keyboard.type('World');
    await page.keyboard.press('Control+b');

    // Verify bold
    const html = await page.evaluate(() =>
      document.querySelector('.gotipe-editor')?.innerHTML
    );
    expect(html).toContain('<strong>World</strong>');
  });

  test('aria roles present', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForSelector('.gotipe-editor');

    const role = await page.getAttribute('.gotipe-editor', 'role');
    expect(role).toBe('textbox');

    const ariaMultiline = await page.getAttribute('.gotipe-editor', 'aria-multiline');
    expect(ariaMultiline).toBe('true');
  });
});
```

---

## 10. Browser Compatibility Matrix

### Supported Browsers

| Browser | Minimum version | WASM | WebSocket | contentEditable | Notes |
|---------|-------------------|------|-----------|-----------------|-------|
| **Chrome** | 90+ | Full | Full | Full | Primary target |
| **Firefox** | 90+ | Full | Full | Full | |
| **Safari** | 15+ | Full | Full | Full | Safari 14 -- partial WASM support |
| **Edge** | 90+ | Full | Full | Full | Chromium-based |
| **Chrome Android** | 90+ | Full | Full | Full | Mobile keyboard handling |
| **Safari iOS** | 15+ | Full | Full | Limited | The Selection API is limited |
| **Samsung Internet** | 15+ | Full | Full | Full | Chromium-based |
| **Opera** | 76+ | Full | Full | Full | Chromium-based |

### Feature Detection

GoTipe automatically detects browser capabilities and activates a fallback when needed:

```typescript
// packages/core/src/feature-detection.ts

export interface BrowserCapabilities {
  /** WebAssembly is supported */
  wasm: boolean;
  /** WebAssembly SIMD is supported (accelerated operations) */
  wasmSimd: boolean;
  /** SharedArrayBuffer is available (multi-threaded WASM) */
  sharedArrayBuffer: boolean;
  /** WebSocket is supported */
  webSocket: boolean;
  /** IndexedDB for offline persistence */
  indexedDB: boolean;
  /** Clipboard API (async) */
  clipboardApi: boolean;
  /** Selection API (full) */
  selectionApi: boolean;
  /** Drag and Drop API */
  dragAndDrop: boolean;
  /** ResizeObserver (for virtual rendering) */
  resizeObserver: boolean;
  /** InputEvent.getTargetRanges() */
  inputEventLevel2: boolean;
}

export function detectCapabilities(): BrowserCapabilities {
  return {
    wasm: typeof WebAssembly !== 'undefined',
    wasmSimd: checkWasmSimd(),
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    webSocket: typeof WebSocket !== 'undefined',
    indexedDB: typeof indexedDB !== 'undefined',
    clipboardApi: typeof navigator.clipboard !== 'undefined',
    selectionApi: typeof window.getSelection !== 'undefined',
    dragAndDrop: 'draggable' in document.createElement('div'),
    resizeObserver: typeof ResizeObserver !== 'undefined',
    inputEventLevel2: typeof InputEvent !== 'undefined'
      && typeof InputEvent.prototype.getTargetRanges === 'function',
  };
}
```

### Polyfills

| Feature | Polyfill | When needed |
|---------|----------|-------------|
| WebAssembly | JS fallback (`@gotipe/core-js`) | IE11 (not supported), very old browsers |
| ResizeObserver | `resize-observer-polyfill` | Safari < 13.1 |
| Clipboard API | Fallback to `document.execCommand` | Firefox < 87 (partial) |
| `structuredClone` | `core-js/actual/structured-clone` | Node.js < 17, Safari < 15.4 |

```typescript
// packages/core/src/polyfills.ts

export async function ensurePolyfills(): Promise<void> {
  // ResizeObserver
  if (typeof ResizeObserver === 'undefined') {
    const { ResizeObserver: Polyfill } = await import('resize-observer-polyfill');
    window.ResizeObserver = Polyfill;
  }

  // structuredClone
  if (typeof structuredClone === 'undefined') {
    const { default: clone } = await import('core-js/actual/structured-clone');
    window.structuredClone = clone;
  }
}
```

### Graceful Degradation

| Scenario | Behavior |
|----------|----------|
| WASM is not supported | Fall back to the JS polyfill (`@gotipe/core-js`). 2-5x slower, but works |
| WebSocket is unavailable | Offline mode. All changes go into the CRDT, sync on reconnect |
| Clipboard API is unavailable | Fall back to `document.execCommand('copy')` |
| Drag and Drop is unavailable | Blocks are moved via slash commands / cut-paste |
| SharedArrayBuffer is unavailable | Single-threaded WASM (without COOP/COEP). Works, slightly slower |

### Known Limitations per Browser

| Browser | Limitation | Workaround |
|---------|-----------|-----------|
| **Safari iOS** | The Selection API does not fully support `setBaseAndExtent` | Use a fallback via the `Range` API |
| **Safari iOS** | The virtual keyboard can cover the toolbar | Use the `visualViewport` API for positioning |
| **Safari** | `contenteditable` edge cases with IME input | Handled via `CompositionEvent` |
| **Firefox** | `document.execCommand('insertText')` is deprecated | Use `InputEvent` level 2 |
| **Firefox** | `getTargetRanges()` returns an empty array for some input types | Fall back to `beforeinput` data |
| **Chrome Android** | Swipe-to-type (Gboard) generates non-standard events | Special handling of composition events |
| **Samsung Internet** | Custom fonts in PDF export may fail to load | Use bundled fonts |

### WASM Binary Size Impact

| Browser | WASM cache | Streaming Compile | Result |
|---------|---------|-------------------|--------|
| Chrome 90+ | Yes (V8 code cache) | Yes (`WebAssembly.compileStreaming`) | First load ~100ms, repeat load ~20ms |
| Firefox 90+ | Yes | Yes | First load ~120ms, repeat load ~25ms |
| Safari 15+ | Yes | Partial | First load ~150ms, repeat load ~30ms |
| Edge 90+ | Yes (V8) | Yes | Same as Chrome |

```typescript
// Optimal WASM loading with caching
async function loadWasm(): Promise<WebAssembly.Module> {
  const wasmUrl = new URL('@gotipe/wasm/gotipe_wasm_bg.wasm', import.meta.url);

  if (typeof WebAssembly.compileStreaming === 'function') {
    // Streaming compile -- the fastest path
    return WebAssembly.compileStreaming(fetch(wasmUrl));
  } else {
    // Fallback for Safari < 15.2
    const response = await fetch(wasmUrl);
    const bytes = await response.arrayBuffer();
    return WebAssembly.compile(bytes);
  }
}
```

---

## Related Documents

- [00-overview.md](00-overview.md) -- Product overview, target audience
- [01-architecture.md](01-architecture.md) -- System architecture, Rust/WASM core, document model, performance benchmarks
- [02-collaboration.md](02-collaboration.md) -- Real-time collaboration, CRDT engine, sync protocol, Yjs compatibility adapter
- [03-editor-core.md](03-editor-core.md) -- Editor core: schema, transforms, commands, EditorState
- [04-block-editor.md](04-block-editor.md) -- Block editor UX: slash commands, drag-and-drop, Notion-like
- [05-extensions.md](05-extensions.md) -- Extension system: API, built-in extensions, custom extensions, presets
- [06-framework-adapters.md](06-framework-adapters.md) -- React, Vue, Svelte, Solid adapters, SSR, headless mode
- [07-ai.md](07-ai.md) -- AI integration: ghost text, commands, providers
- [08-export-import.md](08-export-import.md) -- Document conversion: HTML, Markdown, PDF, DOCX
- [09-sdk-and-api.md](09-sdk-and-api.md) -- SDK packages, types, API reference
- [10-cloud.md](10-cloud.md) -- GoTipe Cloud: managed sync, AI, export
- [13-competitive.md](13-competitive.md) -- Competitive analysis: Tiptap, ProseMirror, Lexical, Slate, CKEditor
