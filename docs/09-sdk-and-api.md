# GoTipe — SDK and API

> **PDF: historical proposal.** The mentions of Typst/docx-rs and the size estimates and
> capabilities below do not describe the current backend. GoTipe owns PDF layout and
> OOXML rendering; see the current [export contract](development/export-contract.md)
> and [dependency policy](development/dependencies.md).

> Historical design document. The signatures, sizes, prices, comparisons and plans below
> do not confirm the current implementation or an available service. Current contracts:
> [development](development/editor-contracts.md), [export](development/export-contract.md),
> [Cloud](development/cloud-contract.md), [release readiness](22-release-readiness.md).

Reference for all GoTipe npm packages: TypeScript interfaces, signatures, examples, exports configuration.

Source of truth for the Rust types: [03-editor-core.md](03-editor-core.md). This document describes the TypeScript bindings on top of WASM.

---

## Contents

- [Data types (core interfaces)](#data-types-core-interfaces)
- [@gotipe/core](#gotipecore)
- [@gotipe/react](#gotipereact)
- [@gotipe/vue](#gotipevue)
- [@gotipe/svelte](#gotipesvelte)
- [@gotipe/solid](#gotipesolid)
- [@gotipe/collaboration](#gotipecollaboration)
- [@gotipe/ai](#gotipeai)
- [@gotipe/export](#gotipeexport)
- [Error Handling](#error-handling)
- [package.json exports](#packagejson-exports)

---

## Data types (core interfaces)

All types are defined in `@gotipe/core` and re-exported from every adapter. They mirror the Rust types from [03-editor-core.md](03-editor-core.md).

### AttrValue

```typescript
// packages/core/src/types/attr.ts

export type AttrValue = string | number | boolean | null;
```

### Mark

```typescript
// packages/core/src/types/mark.ts

export interface Mark {
  /** Mark type: "bold", "italic", "link", etc. */
  readonly type: string;
  /** Mark attributes (href for link, color for highlight) */
  readonly attrs: Record<string, AttrValue>;
}
```

### TextSpan

```typescript
// packages/core/src/types/text-span.ts

export interface TextSpan {
  /** Text content of the span */
  readonly text: string;
  /** Inline marks applied to the span */
  readonly marks: readonly Mark[];
}
```

### Block

```typescript
// packages/core/src/types/block.ts

export type BlockContent =
  | { type: 'richText'; spans: readonly TextSpan[] }
  | { type: 'raw'; text: string }
  | { type: 'empty' };

export interface Block {
  /** Unique identifier (UUID v7) */
  readonly id: string;
  /** Block type: "paragraph", "heading", "codeBlock", etc. */
  readonly type: string;
  /** Block attributes (level for heading, language for codeBlock) */
  readonly attrs: Record<string, AttrValue>;
  /** Block content */
  readonly content: BlockContent;
  /** Nested blocks (list items, table rows, columns) */
  readonly children: readonly Block[];
}
```

### Selection

```typescript
// packages/core/src/types/selection.ts

export type Selection =
  | {
      type: 'text';
      blockId: string;
      from: number;
      to: number;
    }
  | {
      type: 'block';
      blockIds: string[];
    }
  | {
      type: 'all';
    };
```

### Step and Transaction

```typescript
// packages/core/src/types/transaction.ts

export type Step =
  | { type: 'insertText'; blockId: string; offset: number; text: string; marks: Mark[] }
  | { type: 'deleteText'; blockId: string; from: number; to: number }
  | { type: 'insertBlock'; parentId: string | null; index: number; block: Block }
  | { type: 'deleteBlock'; blockId: string }
  | { type: 'moveBlock'; blockId: string; newParentId: string | null; newIndex: number }
  | { type: 'setBlockAttrs'; blockId: string; attrs: Record<string, AttrValue> }
  | { type: 'setBlockType'; blockId: string; newType: string; attrs: Record<string, AttrValue> }
  | { type: 'addMark'; blockId: string; from: number; to: number; mark: Mark }
  | { type: 'removeMark'; blockId: string; from: number; to: number; markType: string }
  | { type: 'splitBlock'; blockId: string; offset: number }
  | { type: 'mergeBlocks'; blockId: string; targetId: string };

export interface Transaction {
  /** Atomic transform steps */
  readonly steps: readonly Step[];
  /** New cursor position (null = auto-map) */
  readonly selection: Selection | null;
  /** Metadata (source, timestamp, ...) */
  readonly metadata: Record<string, AttrValue>;
}
```

### EditorState

```typescript
// packages/core/src/types/state.ts

export interface EditorState {
  /** Document — a tree of blocks */
  readonly doc: {
    readonly blocks: readonly Block[];
    readonly version: number;
  };
  /** Current cursor position / selection */
  readonly selection: Selection;
  /** Schema the editor was created with */
  readonly schema: Schema;
}
```

### Schema

```typescript
// packages/core/src/types/schema.ts

export type ContentRule = 'richText' | 'rawText' | 'empty';
export type MarksRule = 'all' | 'none' | string[];

export interface AttrSpec {
  type: 'string' | 'number' | 'bool' | { enum: string[] };
  default?: AttrValue;
  required?: boolean;
}

export interface NodeSpec {
  name: string;
  group: string[];
  content: ContentRule;
  attrs: Record<string, AttrSpec>;
  topLevel: boolean;
  marksAllowed: MarksRule;
  leaf: boolean;
  allowsChildren: boolean;
  childTypes?: string[];
}

export interface MarkSpec {
  name: string;
  exclusiveGroup?: string;
  attrs: Record<string, AttrSpec>;
  rank: number;
}

export interface Schema {
  nodes: Record<string, NodeSpec>;
  marks: Record<string, MarkSpec>;
}
```

### EditorOptions

```typescript
// packages/core/src/types/options.ts

import type { Extension } from './extension';

export interface EditorOptions {
  /** List of extensions (define the schema, commands, keybindings) */
  extensions: Extension[];

  /** Initial content (JSON document or HTML string) */
  content?: Block[] | string;

  /** Read-only mode */
  editable?: boolean;

  /** CSS class for the root element */
  editorClass?: string;

  /** Callback on every document update */
  onUpdate?: (props: { editor: GoTipeEditor; transaction: Transaction }) => void;

  /** Callback on selection change */
  onSelectionUpdate?: (props: { editor: GoTipeEditor; selection: Selection }) => void;

  /** Callback when the editor is created */
  onCreate?: (props: { editor: GoTipeEditor }) => void;

  /** Callback when the editor is destroyed */
  onDestroy?: () => void;

  /** Callback on focus/blur */
  onFocus?: (props: { editor: GoTipeEditor; event: FocusEvent }) => void;
  onBlur?: (props: { editor: GoTipeEditor; event: FocusEvent }) => void;

  /** Callback before every transaction (return false to cancel) */
  onBeforeTransaction?: (props: { editor: GoTipeEditor; transaction: Transaction }) => boolean;

  /** Autofocus on creation */
  autofocus?: boolean | 'start' | 'end';

  /** Inline styles for the editor container */
  editorStyle?: Record<string, string>;
}
```

### GoTipeEditor (main editor class)

```typescript
// packages/core/src/types/editor.ts

export interface GoTipeEditor {
  // --- State ---

  /** Current editor state (immutable snapshot) */
  readonly state: EditorState;

  /** Schema of the current editor */
  readonly schema: Schema;

  /** true if the editor is not destroyed */
  readonly isActive: boolean;

  /** true if the editor is in "read-only" mode */
  readonly isEditable: boolean;

  // --- Document access ---

  /** Get the document as JSON */
  getJSON(): { blocks: Block[]; version: number };

  /** Get the document as HTML */
  getHTML(): string;

  /** Get plain text */
  getText(): string;

  /** Find a block by ID */
  getBlock(blockId: string): Block | null;

  /** Check whether the document is empty */
  isEmpty(): boolean;

  // --- Chainable command API ---

  /**
   * Start a command chain.
   * Every chain method returns this.
   * `.run()` applies the accumulated Transaction.
   */
  chain(): ChainableCommands;

  // --- Direct commands ---

  /** Apply an arbitrary Transaction */
  dispatch(transaction: Transaction): void;

  /** Undo the last action */
  undo(): boolean;

  /** Redo an undone action */
  redo(): boolean;

  /** Set editable/readonly */
  setEditable(editable: boolean): void;

  /** Set focus */
  focus(position?: 'start' | 'end' | number): void;

  /** Remove focus */
  blur(): void;

  // --- Events ---

  /** Subscribe to an event */
  on<K extends keyof EditorEvents>(event: K, handler: EditorEvents[K]): () => void;

  /** Unsubscribe from an event */
  off<K extends keyof EditorEvents>(event: K, handler: EditorEvents[K]): void;

  /** Emit an event */
  emit<K extends keyof EditorEvents>(event: K, ...args: Parameters<EditorEvents[K]>): void;

  // --- Lifecycle ---

  /** Destroy the editor, free WASM memory */
  destroy(): void;
}

export interface EditorEvents {
  update: (props: { editor: GoTipeEditor; transaction: Transaction }) => void;
  selectionUpdate: (props: { editor: GoTipeEditor; selection: Selection }) => void;
  focus: (props: { editor: GoTipeEditor; event: FocusEvent }) => void;
  blur: (props: { editor: GoTipeEditor; event: FocusEvent }) => void;
  create: (props: { editor: GoTipeEditor }) => void;
  destroy: () => void;
}
```

### ChainableCommands

```typescript
// packages/core/src/types/commands.ts

export interface ChainableCommands {
  // --- Text formatting ---
  toggleBold(): this;
  toggleItalic(): this;
  toggleUnderline(): this;
  toggleStrikethrough(): this;
  toggleCode(): this;
  toggleHighlight(attrs?: { color?: string }): this;
  toggleSuperscript(): this;
  toggleSubscript(): this;
  toggleMark(markType: string, attrs?: Record<string, AttrValue>): this;
  setLink(attrs: { href: string; target?: string }): this;
  removeLink(): this;
  addMark(markType: string, from?: number, to?: number, attrs?: Record<string, AttrValue>): this;
  removeMark(markType: string, from?: number, to?: number): this;

  // --- Block operations ---
  setBlockType(type: string, attrs?: Record<string, AttrValue>): this;
  insertBlockAfter(type: string, attrs?: Record<string, AttrValue>): this;
  insertBlockBefore(type: string, attrs?: Record<string, AttrValue>): this;
  deleteBlock(blockId?: string): this;
  moveBlockUp(): this;
  moveBlockDown(): this;
  duplicateBlock(): this;
  setBlockAttrs(attrs: Record<string, AttrValue>): this;

  // --- List operations ---
  toggleBulletList(): this;
  toggleOrderedList(attrs?: { start?: number }): this;
  toggleTodoList(): this;
  indent(): this;
  outdent(): this;
  splitListItem(): this;

  // --- Text insertion ---
  insertText(text: string): this;
  deleteSelection(): this;

  // --- Block splitting / merging ---
  splitBlock(): this;
  mergeWithPrevious(): this;
  insertHardBreak(): this;

  // --- Selection ---
  selectAll(): this;
  selectBlock(blockId?: string): this;
  setSelection(selection: Selection): this;

  // --- Table ---
  insertTable(opts: { rows: number; cols: number; withHeader?: boolean }): this;
  addRow(position?: 'before' | 'after'): this;
  addColumn(position?: 'before' | 'after'): this;
  deleteRow(): this;
  deleteColumn(): this;
  goToNextCell(): this;
  goToPrevCell(): this;

  // --- History ---
  undo(): this;
  redo(): this;

  // --- Execute ---
  /** Apply all accumulated commands as a single Transaction */
  run(): boolean;
}
```

---

## @gotipe/core

Headless editor core. A TypeScript wrapper over the Rust/WASM engine. Framework-independent.

| | |
|---|---|
| **npm** | `@gotipe/core` |
| **Bundle size (gzip)** | ~18 KB (JS bindings) + ~255 KB (WASM binary) |
| **Dependencies** | `@gotipe/wasm` |
| **Documentation** | [01-architecture.md](01-architecture.md), [03-editor-core.md](03-editor-core.md), [05-extensions.md](05-extensions.md) |

### Key exports

```typescript
// packages/core/src/index.ts

/** Create an editor instance */
export function createEditor(options: EditorOptions): GoTipeEditor;

/** Initialize the WASM engine (called automatically by createEditor) */
export function initGoTipe(): Promise<void>;

/** Define an extension */
export function defineExtension<O = any>(config: ExtensionConfig<O>): Extension<O>;

// --- Types ---
export type {
  GoTipeEditor,
  EditorOptions,
  EditorState,
  Transaction,
  Step,
  Block,
  BlockContent,
  TextSpan,
  Mark,
  AttrValue,
  Selection,
  Schema,
  NodeSpec,
  MarkSpec,
  ChainableCommands,
  Extension,
  ExtensionConfig,
};

// --- Built-in extensions ---
export {
  Paragraph,
  Heading,
  BulletList,
  OrderedList,
  ListItem,
  CodeBlock,
  Image,
  Table,
  Blockquote,
  Callout,
  Divider,
  Toggle,
  Columns,
  Embed,
  Math,
  File,
} from './extensions/nodes';

export {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  InlineCode,
  Link,
  Highlight,
  Superscript,
  Subscript,
} from './extensions/marks';

export {
  History,
  Placeholder,
  DragAndDrop,
  SlashCommands,
} from './extensions/behaviors';

// --- Presets ---
export { MinimalPreset, DefaultPreset, FullPreset } from './presets';
```

### Example

```typescript
import { createEditor, DefaultPreset } from '@gotipe/core';

const editor = createEditor({
  extensions: DefaultPreset,
  content: [{ id: 'b1', type: 'paragraph', attrs: {}, content: { type: 'richText', spans: [{ text: 'Hello', marks: [] }] }, children: [] }],
  onUpdate: ({ editor }) => console.log(editor.getJSON()),
});

editor.chain().toggleBold().insertText(' world').run();
```

### package.json

```jsonc
// packages/core/package.json
{
  "name": "@gotipe/core",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    },
    "./extensions": {
      "types": "./dist/extensions/index.d.ts",
      "import": "./dist/extensions/index.mjs",
      "require": "./dist/extensions/index.cjs"
    },
    "./presets": {
      "types": "./dist/presets.d.ts",
      "import": "./dist/presets.mjs",
      "require": "./dist/presets.cjs"
    },
    "./types": {
      "types": "./dist/types/index.d.ts"
    }
  },
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "sideEffects": false,
  "dependencies": {
    "@gotipe/wasm": "workspace:*"
  },
  "peerDependencies": {},
  "license": "MIT"
}
```

---

## @gotipe/react

React 18+ adapter. Components and hooks for connecting GoTipe to a React application.

| | |
|---|---|
| **npm** | `@gotipe/react` |
| **Bundle size (gzip)** | ~6 KB |
| **Peer dependencies** | `react >=18`, `react-dom >=18`, `@gotipe/core` |
| **Documentation** | [06-framework-adapters.md](06-framework-adapters.md) |

### Key exports

```typescript
// packages/react/src/index.ts

// --- Hooks ---

/**
 * Create a GoTipeEditor and bind it to the React lifecycle.
 * Returns the editor instance. WASM is initialized automatically.
 */
export function useEditor(options: EditorOptions, deps?: any[]): GoTipeEditor | null;

/**
 * Subscribe to EditorState with a selector.
 * Re-renders only when the returned value changes (shallow equal).
 */
export function useEditorState<T>(
  editor: GoTipeEditor | null,
  selector: (state: EditorState) => T,
): T | undefined;

/**
 * Subscribe to collaboration awareness (cursors, presence).
 * Works only when @gotipe/collaboration is connected.
 */
export function useCollaboration(editor: GoTipeEditor | null): {
  users: CollaborationUser[];
  isConnected: boolean;
  isSynced: boolean;
};

// --- Components ---

export interface EditorProps {
  editor: GoTipeEditor | null;
  className?: string;
  style?: React.CSSProperties;
}

/** Root editor component: renders blocks, handles input */
export const Editor: React.FC<EditorProps>;

export interface BubbleMenuProps {
  editor: GoTipeEditor | null;
  /** Show on text selection */
  shouldShow?: (props: { editor: GoTipeEditor; state: EditorState }) => boolean;
  /** Offset from the selection (px) */
  offset?: { x?: number; y?: number };
  children: React.ReactNode;
}

/** Floating toolbar that appears on text selection */
export const BubbleMenu: React.FC<BubbleMenuProps>;

export interface FloatingMenuProps {
  editor: GoTipeEditor | null;
  /** Show on an empty block */
  shouldShow?: (props: { editor: GoTipeEditor; state: EditorState }) => boolean;
  children: React.ReactNode;
}

/** Floating menu that appears to the left of an empty block */
export const FloatingMenu: React.FC<FloatingMenuProps>;

export interface BlockToolbarProps {
  editor: GoTipeEditor | null;
  /** Drag handle + block type menu */
  children?: React.ReactNode;
}

/** Toolbar for each block (drag handle, type menu) */
export const BlockToolbar: React.FC<BlockToolbarProps>;
```

### Example

```tsx
import { useEditor } from '@gotipe/react';
import { Editor, BubbleMenu } from '@gotipe/react';
import { DefaultPreset } from '@gotipe/core';

function MyEditor() {
  const editor = useEditor({ extensions: DefaultPreset, content: '<p>Start typing...</p>' });
  return (
    <>
      <BubbleMenu editor={editor}><button onClick={() => editor?.chain().toggleBold().run()}>B</button></BubbleMenu>
      <Editor editor={editor} className="my-editor" />
    </>
  );
}
```

### package.json

```jsonc
// packages/react/package.json
{
  "name": "@gotipe/react",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    }
  },
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "sideEffects": false,
  "peerDependencies": {
    "@gotipe/core": "^0.1.0",
    "react": ">=18.0.0",
    "react-dom": ">=18.0.0"
  },
  "license": "MIT"
}
```

---

## @gotipe/vue

Vue 3 adapter. Composables and components.

| | |
|---|---|
| **npm** | `@gotipe/vue` |
| **Bundle size (gzip)** | ~5 KB |
| **Peer dependencies** | `vue >=3.4`, `@gotipe/core` |
| **Documentation** | [06-framework-adapters.md](06-framework-adapters.md) |

### Key exports

```typescript
// packages/vue/src/index.ts

/**
 * Composable: create an editor, bind it to the component lifecycle.
 * Returns ShallowRef<GoTipeEditor | null>.
 */
export function useEditor(options: MaybeRefOrGetter<EditorOptions>): ShallowRef<GoTipeEditor | null>;

/**
 * Composable: subscribe to state with a selector.
 * Returns a computed ref.
 */
export function useEditorState<T>(
  editor: ShallowRef<GoTipeEditor | null>,
  selector: (state: EditorState) => T,
): ComputedRef<T | undefined>;

/** Editor component */
export const GoTipeEditorComponent: DefineComponent<{
  editor: GoTipeEditor | null;
  class?: string;
}>;

/** Bubble menu component */
export const BubbleMenu: DefineComponent<{
  editor: GoTipeEditor | null;
  shouldShow?: (ctx: { editor: GoTipeEditor; state: EditorState }) => boolean;
}>;

/** Floating menu component */
export const FloatingMenu: DefineComponent<{
  editor: GoTipeEditor | null;
  shouldShow?: (ctx: { editor: GoTipeEditor; state: EditorState }) => boolean;
}>;

/** Block toolbar component */
export const BlockToolbar: DefineComponent<{
  editor: GoTipeEditor | null;
}>;
```

### Example

```vue
<script setup lang="ts">
import { useEditor } from '@gotipe/vue';
import { GoTipeEditorComponent as Editor, BubbleMenu } from '@gotipe/vue';
import { DefaultPreset } from '@gotipe/core';

const editor = useEditor({ extensions: DefaultPreset, content: '<p>Hello</p>' });
</script>

<template>
  <BubbleMenu :editor="editor"><button @click="editor?.chain().toggleBold().run()">B</button></BubbleMenu>
  <Editor :editor="editor" class="my-editor" />
</template>
```

### package.json

```jsonc
// packages/vue/package.json
{
  "name": "@gotipe/vue",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    }
  },
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "sideEffects": false,
  "peerDependencies": {
    "@gotipe/core": "^0.1.0",
    "vue": ">=3.4.0"
  },
  "license": "MIT"
}
```

---

## @gotipe/svelte

Svelte 5 adapter. Runes-based API ($state, $derived, $effect).

| | |
|---|---|
| **npm** | `@gotipe/svelte` |
| **Bundle size (gzip)** | ~4 KB |
| **Peer dependencies** | `svelte >=5`, `@gotipe/core` |
| **Documentation** | [06-framework-adapters.md](06-framework-adapters.md) |

### Key exports

```typescript
// packages/svelte/src/index.ts

/**
 * Create an editor instance as a $state rune.
 * Automatic cleanup when the component is destroyed.
 */
export function createEditorState(options: EditorOptions): {
  /** $state: editor instance (null while WASM is loading) */
  readonly editor: GoTipeEditor | null;
  /** $derived: current state */
  readonly state: EditorState | undefined;
  /** $derived: is editor ready */
  readonly isReady: boolean;
};

/**
 * Subscribe to EditorState with a selector.
 * Returns a $derived rune.
 */
export function useEditorState<T>(
  editor: GoTipeEditor | null,
  selector: (state: EditorState) => T,
): { readonly value: T | undefined };
```

### Components

```
Editor.svelte        — root editor
BubbleMenu.svelte    — floating toolbar on selection
FloatingMenu.svelte  — menu for an empty block
BlockToolbar.svelte  — drag handle + block menu
```

### Example

```svelte
<script>
  import { createEditorState } from '@gotipe/svelte';
  import Editor from '@gotipe/svelte/Editor.svelte';
  import BubbleMenu from '@gotipe/svelte/BubbleMenu.svelte';
  import { DefaultPreset } from '@gotipe/core';

  const { editor, isReady } = createEditorState({ extensions: DefaultPreset });
</script>

{#if isReady}
  <BubbleMenu editor={editor}>
    <button onclick={() => editor?.chain().toggleBold().run()}>B</button>
  </BubbleMenu>
  <Editor {editor} class="my-editor" />
{/if}
```

### package.json

```jsonc
// packages/svelte/package.json
{
  "name": "@gotipe/svelte",
  "version": "0.1.0",
  "type": "module",
  "svelte": "./dist/index.js",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "svelte": "./dist/index.js",
      "import": "./dist/index.js"
    },
    "./Editor.svelte": {
      "types": "./dist/Editor.svelte.d.ts",
      "svelte": "./dist/Editor.svelte"
    },
    "./BubbleMenu.svelte": {
      "types": "./dist/BubbleMenu.svelte.d.ts",
      "svelte": "./dist/BubbleMenu.svelte"
    },
    "./FloatingMenu.svelte": {
      "types": "./dist/FloatingMenu.svelte.d.ts",
      "svelte": "./dist/FloatingMenu.svelte"
    },
    "./BlockToolbar.svelte": {
      "types": "./dist/BlockToolbar.svelte.d.ts",
      "svelte": "./dist/BlockToolbar.svelte"
    }
  },
  "files": ["dist"],
  "sideEffects": false,
  "peerDependencies": {
    "@gotipe/core": "^0.1.0",
    "svelte": ">=5.0.0"
  },
  "license": "MIT"
}
```

---

## @gotipe/solid

Solid adapter. Signals-based API.

| | |
|---|---|
| **npm** | `@gotipe/solid` |
| **Bundle size (gzip)** | ~4 KB |
| **Peer dependencies** | `solid-js >=1.8`, `@gotipe/core` |
| **Documentation** | [06-framework-adapters.md](06-framework-adapters.md) |

### Key exports

```typescript
// packages/solid/src/index.ts

import type { Accessor } from 'solid-js';

/**
 * Create an editor instance as a signal.
 * Automatic cleanup via onCleanup.
 */
export function createEditor(options: EditorOptions | Accessor<EditorOptions>): Accessor<GoTipeEditor | null>;

/**
 * Subscribe to EditorState with a selector.
 * Returns a memo signal that recomputes only when the slice changes.
 */
export function useEditorState<T>(
  editor: Accessor<GoTipeEditor | null>,
  selector: (state: EditorState) => T,
): Accessor<T | undefined>;

// --- Components ---
export const Editor: Component<{ editor: GoTipeEditor | null; class?: string }>;
export const BubbleMenu: Component<{ editor: GoTipeEditor | null; children: JSX.Element }>;
export const FloatingMenu: Component<{ editor: GoTipeEditor | null; children: JSX.Element }>;
export const BlockToolbar: Component<{ editor: GoTipeEditor | null }>;
```

### Example

```tsx
import { createEditor } from '@gotipe/solid';
import { Editor, BubbleMenu } from '@gotipe/solid';
import { DefaultPreset } from '@gotipe/core';

function MyEditor() {
  const editor = createEditor({ extensions: DefaultPreset });
  return (
    <>
      <BubbleMenu editor={editor()}><button onClick={() => editor()?.chain().toggleBold().run()}>B</button></BubbleMenu>
      <Editor editor={editor()} class="my-editor" />
    </>
  );
}
```

### package.json

```jsonc
// packages/solid/package.json
{
  "name": "@gotipe/solid",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "solid": "./dist/index.jsx",
      "import": "./dist/index.mjs"
    }
  },
  "main": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "sideEffects": false,
  "peerDependencies": {
    "@gotipe/core": "^0.1.0",
    "solid-js": ">=1.8.0"
  },
  "license": "MIT"
}
```

---

## @gotipe/collaboration

CRDT sync client. Connects the editor to a sync server or WebRTC for real-time collaboration.

| | |
|---|---|
| **npm** | `@gotipe/collaboration` |
| **Bundle size (gzip)** | ~8 KB (JS client; the CRDT engine is in WASM, already in @gotipe/core) |
| **Peer dependencies** | `@gotipe/core` |
| **Documentation** | [02-collaboration.md](02-collaboration.md) |

### Key exports

```typescript
// packages/collaboration/src/index.ts

import type { Extension, GoTipeEditor } from '@gotipe/core';

// --- Extension ---

export interface CollaborationOptions {
  /** URL WebSocket sync server */
  serverUrl: string;
  /** Document identifier */
  documentId: string;
  /** Name/color of the current user (awareness) */
  user?: { name: string; color: string; avatar?: string };
  /** Auth token (sent in the WebSocket handshake) */
  token?: string;
  /** Reconnect strategy */
  reconnect?: { maxRetries?: number; baseDelay?: number; maxDelay?: number };
}

/** Extension for CRDT collaboration over WebSocket */
export const Collaboration: Extension<CollaborationOptions>;

// --- Providers ---

export interface SyncProvider {
  readonly isConnected: boolean;
  readonly isSynced: boolean;
  connect(): void;
  disconnect(): void;
  destroy(): void;
  on(event: 'connect' | 'disconnect' | 'sync' | 'error', handler: (...args: any[]) => void): void;
}

export interface CollaborationUser {
  clientId: string;
  name: string;
  color: string;
  avatar?: string;
  cursor?: { blockId: string; offset: number };
  selection?: { blockId: string; from: number; to: number };
  lastActive: number;
}

/** WebSocket provider: connection to the GoTipe Sync Server */
export class GoTipeProvider implements SyncProvider {
  constructor(opts: {
    serverUrl: string;
    documentId: string;
    editor: GoTipeEditor;
    token?: string;
  });

  readonly isConnected: boolean;
  readonly isSynced: boolean;
  readonly users: CollaborationUser[];

  connect(): void;
  disconnect(): void;
  destroy(): void;

  on(event: 'connect' | 'disconnect' | 'sync' | 'error' | 'users-change', handler: (...args: any[]) => void): void;
}

/** WebRTC provider: peer-to-peer without a server */
export class WebRTCProvider implements SyncProvider {
  constructor(opts: {
    signalingUrl: string;
    roomId: string;
    editor: GoTipeEditor;
    password?: string;
  });

  readonly isConnected: boolean;
  readonly isSynced: boolean;
  readonly peers: string[];

  connect(): void;
  disconnect(): void;
  destroy(): void;

  on(event: 'connect' | 'disconnect' | 'sync' | 'error' | 'peer-join' | 'peer-leave', handler: (...args: any[]) => void): void;
}
```

### Example

```typescript
import { createEditor, DefaultPreset } from '@gotipe/core';
import { Collaboration } from '@gotipe/collaboration';

const editor = createEditor({
  extensions: [
    ...DefaultPreset,
    Collaboration.configure({
      serverUrl: 'wss://sync.gotipe.com',
      documentId: 'doc-abc-123',
      user: { name: 'Alice', color: '#ff6b6b' },
      token: 'jwt-token-here',
    }),
  ],
});
```

### package.json

```jsonc
// packages/collaboration/package.json
{
  "name": "@gotipe/collaboration",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    },
    "./providers": {
      "types": "./dist/providers/index.d.ts",
      "import": "./dist/providers/index.mjs",
      "require": "./dist/providers/index.cjs"
    }
  },
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "sideEffects": false,
  "peerDependencies": {
    "@gotipe/core": "^0.1.0"
  },
  "license": "MIT"
}
```

---

## @gotipe/ai

AI integration layer. Ghost text, AI commands, provider-agnostic architecture.

| | |
|---|---|
| **npm** | `@gotipe/ai` |
| **Bundle size (gzip)** | ~6 KB (JS client; the context builder is in WASM) |
| **Peer dependencies** | `@gotipe/core` |
| **Documentation** | [07-ai.md](07-ai.md) |

### Key exports

```typescript
// packages/ai/src/index.ts

import type { Extension, GoTipeEditor, Block } from '@gotipe/core';

// --- Extension ---

export interface AIOptions {
  /** AI provider configuration */
  provider: AIProvider;
  /** Hotkey to accept ghost text (default: Tab) */
  acceptKey?: string;
  /** Hotkey to dismiss ghost text (default: Escape) */
  dismissKey?: string;
  /** Debounce for inline suggestions (ms, default: 500) */
  debounceMs?: number;
  /** Maximum tokens for context (default: 4096) */
  maxContextTokens?: number;
}

/** Extension for inline AI suggestions (ghost text) */
export const AIInline: Extension<AIOptions>;

/** Extension for AI slash commands (/ai rewrite, /ai expand, ...) */
export const AICommands: Extension<AIOptions>;

// --- Provider interface ---

export interface AIProvider {
  /** Provider identifier */
  readonly name: string;

  /**
   * Inline completion (ghost text).
   * Returns a text stream.
   */
  complete(params: {
    /** Text before the cursor */
    prefix: string;
    /** Text after the cursor */
    suffix: string;
    /** Surrounding blocks (context) */
    context: Block[];
    /** AbortSignal for cancellation */
    signal: AbortSignal;
  }): AsyncIterable<string>;

  /**
   * AI command (rewrite, expand, translate, ...).
   * Returns a text stream.
   */
  command(params: {
    /** Command type */
    command: 'rewrite' | 'expand' | 'summarize' | 'translate' | 'fixGrammar' | 'changeTone' | string;
    /** Input text */
    input: string;
    /** Additional instructions */
    instructions?: string;
    /** Document context */
    context: Block[];
    /** Language for translate */
    language?: string;
    /** Tone for changeTone */
    tone?: 'formal' | 'casual' | 'professional' | 'friendly';
    signal: AbortSignal;
  }): AsyncIterable<string>;
}

// --- Built-in providers ---

/** OpenAI provider (gpt-4o, gpt-4o-mini) */
export function createOpenAIProvider(opts: {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}): AIProvider;

/** Anthropic provider (Claude) */
export function createAnthropicProvider(opts: {
  apiKey: string;
  model?: string;
}): AIProvider;

/** Ollama provider (local LLM) */
export function createOllamaProvider(opts: {
  baseUrl?: string;
  model: string;
}): AIProvider;

/** GoTipe Cloud AI proxy (routing through GoTipe Cloud) */
export function createGoTipeCloudProvider(opts: {
  apiKey: string;
}): AIProvider;
```

### Example

```typescript
import { createEditor, DefaultPreset } from '@gotipe/core';
import { AIInline, AICommands, createOpenAIProvider } from '@gotipe/ai';

const ai = createOpenAIProvider({ apiKey: 'sk-...', model: 'gpt-4o-mini' });

const editor = createEditor({
  extensions: [
    ...DefaultPreset,
    AIInline.configure({ provider: ai, debounceMs: 300 }),
    AICommands.configure({ provider: ai }),
  ],
});

// Programmatic AI command call
const stream = ai.command({
  command: 'rewrite',
  input: editor.getText(),
  instructions: 'Make it more concise',
  context: editor.getJSON().blocks,
  signal: new AbortController().signal,
});
for await (const chunk of stream) { console.log(chunk); }
```

### package.json

```jsonc
// packages/ai/package.json
{
  "name": "@gotipe/ai",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    },
    "./providers": {
      "types": "./dist/providers/index.d.ts",
      "import": "./dist/providers/index.mjs",
      "require": "./dist/providers/index.cjs"
    }
  },
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "sideEffects": false,
  "peerDependencies": {
    "@gotipe/core": "^0.1.0"
  },
  "license": "MIT"
}
```

---

## @gotipe/export

Document conversion. Client-side (WASM) for HTML/Markdown, server-side or lazy-load for PDF/DOCX.

| | |
|---|---|
| **npm** | `@gotipe/export` |
| **Bundle size (gzip)** | ~4 KB (JS bindings); HTML+MD converters in WASM (~40 KB, already in @gotipe/core); PDF (+~400 KB lazy), DOCX (+~60 KB lazy) |
| **Peer dependencies** | `@gotipe/core` |
| **Documentation** | [08-export-import.md](08-export-import.md) |

### Key exports

```typescript
// packages/export/src/index.ts

import type { Block } from '@gotipe/core';

export interface ExportOptions {
  /** Include inline styles in HTML (default: true) */
  inlineStyles?: boolean;
  /** Custom CSS for PDF export */
  css?: string;
  /** Metadata for PDF/DOCX (author, title) */
  metadata?: {
    title?: string;
    author?: string;
    subject?: string;
    createdAt?: Date;
  };
}

/**
 * Export the document to an HTML string.
 * Synchronous: works through WASM.
 */
export function exportHTML(blocks: readonly Block[], options?: ExportOptions): string;

/**
 * Export the document to a Markdown string.
 * Synchronous: works through WASM.
 */
export function exportMarkdown(blocks: readonly Block[], options?: ExportOptions): string;

/**
 * Export the document to PDF (Uint8Array).
 * Lazy-load: the typst WASM module is loaded on first call.
 */
export function exportPDF(blocks: readonly Block[], options?: ExportOptions): Promise<Uint8Array>;

/**
 * Export the document to DOCX (Uint8Array).
 * Lazy-load: the docx-rs WASM module is loaded on first call.
 */
export function exportDOCX(blocks: readonly Block[], options?: ExportOptions): Promise<Uint8Array>;

/**
 * Import an HTML string into a Block array.
 * Synchronous: parsing goes through WASM.
 */
export function importHTML(html: string): Block[];

/**
 * Import a Markdown string into a Block array.
 * Synchronous: parsing goes through WASM.
 */
export function importMarkdown(markdown: string): Block[];

/** Helper: download a file in the browser */
export function downloadBlob(data: Uint8Array | string, filename: string, mimeType: string): void;
```

### Example

```typescript
import { exportPDF, exportMarkdown, downloadBlob } from '@gotipe/export';

const blocks = editor.getJSON().blocks;

// Markdown — synchronous
const md = exportMarkdown(blocks);
console.log(md);

// PDF — async, lazy-load WASM
const pdf = await exportPDF(blocks, { metadata: { title: 'My Document', author: 'Alice' } });
downloadBlob(pdf, 'document.pdf', 'application/pdf');
```

### package.json

```jsonc
// packages/export/package.json
{
  "name": "@gotipe/export",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    },
    "./pdf": {
      "types": "./dist/pdf.d.ts",
      "import": "./dist/pdf.mjs"
    },
    "./docx": {
      "types": "./dist/docx.d.ts",
      "import": "./dist/docx.mjs"
    }
  },
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "files": ["dist", "wasm"],
  "sideEffects": false,
  "peerDependencies": {
    "@gotipe/core": "^0.1.0"
  },
  "license": "MIT"
}
```

---

## Error Handling

### GoTipeError

All GoTipe errors extend `GoTipeError`. The error code is a string enum for pattern matching.

```typescript
// packages/core/src/errors.ts

export class GoTipeError extends Error {
  readonly code: GoTipeErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: GoTipeErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'GoTipeError';
    this.code = code;
    this.details = details;
  }
}

export type GoTipeErrorCode =
  | 'WASM_INIT_FAILED'
  | 'WASM_NOT_INITIALIZED'
  | 'SCHEMA_VALIDATION_FAILED'
  | 'TRANSFORM_FAILED'
  | 'BLOCK_NOT_FOUND'
  | 'INVALID_CONTENT_TYPE'
  | 'OFFSET_OUT_OF_RANGE'
  | 'MARK_NOT_ALLOWED'
  | 'UNKNOWN_BLOCK_TYPE'
  | 'UNKNOWN_MARK_TYPE'
  | 'COLLABORATION_ERROR'
  | 'AI_PROVIDER_ERROR'
  | 'EXPORT_FAILED'
  | 'IMPORT_PARSE_ERROR';
```

### Handling patterns

```typescript
import { GoTipeError } from '@gotipe/core';

// 1. try/catch with a code check
try {
  editor.dispatch(transaction);
} catch (e) {
  if (e instanceof GoTipeError) {
    switch (e.code) {
      case 'BLOCK_NOT_FOUND':
        console.warn('Block was deleted concurrently:', e.details?.blockId);
        break;
      case 'SCHEMA_VALIDATION_FAILED':
        console.error('Invalid operation:', e.message);
        break;
      default:
        throw e;
    }
  }
}

// 2. onBeforeTransaction — preventing invalid transactions
const editor = createEditor({
  extensions: DefaultPreset,
  onBeforeTransaction: ({ transaction }) => {
    // return false to cancel the transaction
    if (transaction.metadata.source === 'untrusted') return false;
    return true;
  },
});

// 3. Collaboration error handling
import { GoTipeProvider } from '@gotipe/collaboration';

const provider = new GoTipeProvider({ serverUrl: 'wss://...', documentId: 'doc-1', editor });
provider.on('error', (err) => {
  if (err.code === 'COLLABORATION_ERROR') {
    showToast('Connection lost. Retrying...');
  }
});

// 4. AI error handling with AbortController
const controller = new AbortController();
setTimeout(() => controller.abort(), 10_000); // timeout 10s

try {
  for await (const chunk of ai.complete({ prefix, suffix, context: [], signal: controller.signal })) {
    appendGhostText(chunk);
  }
} catch (e) {
  if (e instanceof DOMException && e.name === 'AbortError') {
    // Timeout or user cancellation — expected
  } else {
    console.error('AI provider error:', e);
  }
}
```

### WASM initialization errors

```typescript
import { initGoTipe } from '@gotipe/core';

// WASM loading can fail (CSP, unsupported browser, network error)
try {
  await initGoTipe();
} catch (e) {
  if (e instanceof GoTipeError && e.code === 'WASM_INIT_FAILED') {
    // Fallback to the JS engine
    const { initGoTipeJS } from '@gotipe/core-js';
    await initGoTipeJS();
  }
}
```

---

## package.json exports

Summary table of exports across all packages. All packages use [conditional exports](https://nodejs.org/api/packages.html#conditional-exports) and dual CJS/ESM.

| Package | Entry point | Types | ESM | CJS |
|-------|------------|-------|-----|-----|
| `@gotipe/core` | `.` | `dist/index.d.ts` | `dist/index.mjs` | `dist/index.cjs` |
| `@gotipe/core` | `./extensions` | `dist/extensions/index.d.ts` | `dist/extensions/index.mjs` | `dist/extensions/index.cjs` |
| `@gotipe/core` | `./presets` | `dist/presets.d.ts` | `dist/presets.mjs` | `dist/presets.cjs` |
| `@gotipe/core` | `./types` | `dist/types/index.d.ts` | -- | -- |
| `@gotipe/react` | `.` | `dist/index.d.ts` | `dist/index.mjs` | `dist/index.cjs` |
| `@gotipe/vue` | `.` | `dist/index.d.ts` | `dist/index.mjs` | `dist/index.cjs` |
| `@gotipe/svelte` | `.` | `dist/index.d.ts` | `dist/index.js` | -- |
| `@gotipe/svelte` | `./Editor.svelte` | `dist/Editor.svelte.d.ts` | `dist/Editor.svelte` | -- |
| `@gotipe/solid` | `.` | `dist/index.d.ts` | `dist/index.mjs` | -- |
| `@gotipe/collaboration` | `.` | `dist/index.d.ts` | `dist/index.mjs` | `dist/index.cjs` |
| `@gotipe/collaboration` | `./providers` | `dist/providers/index.d.ts` | `dist/providers/index.mjs` | `dist/providers/index.cjs` |
| `@gotipe/ai` | `.` | `dist/index.d.ts` | `dist/index.mjs` | `dist/index.cjs` |
| `@gotipe/ai` | `./providers` | `dist/providers/index.d.ts` | `dist/providers/index.mjs` | `dist/providers/index.cjs` |
| `@gotipe/export` | `.` | `dist/index.d.ts` | `dist/index.mjs` | `dist/index.cjs` |
| `@gotipe/export` | `./pdf` | `dist/pdf.d.ts` | `dist/pdf.mjs` | -- |
| `@gotipe/export` | `./docx` | `dist/docx.d.ts` | `dist/docx.mjs` | -- |

### exports field template

```jsonc
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",     // TypeScript — always first
      "import": "./dist/index.mjs",      // ESM
      "require": "./dist/index.cjs"      // CJS (optional)
    },
    "./subpath": {
      "types": "./dist/subpath.d.ts",
      "import": "./dist/subpath.mjs",
      "require": "./dist/subpath.cjs"
    }
  }
}
```

Rules:
1. `"types"` condition always first — TypeScript resolves top to bottom
2. `"import"` for ESM bundlers (Vite, Rollup, esbuild, Node ESM)
3. `"require"` for CJS (Node, Jest without ESM transform)
4. `"svelte"` / `"solid"` conditions for framework-specific resolvers
5. `"sideEffects": false` — tree-shaking for all packages

---

## Related documents

- [01-architecture.md](01-architecture.md) -- system architecture, WASM layer, document model
- [03-editor-core.md](03-editor-core.md) -- Rust types (source of truth), wasm-bindgen API, benchmarks
- [05-extensions.md](05-extensions.md) -- extension API, defineExtension, built-in extensions
- [06-framework-adapters.md](06-framework-adapters.md) -- rendering details, virtual DOM, custom block renderers
