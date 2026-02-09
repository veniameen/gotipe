# GoTipe — SDK и API

Справочник по всем npm-пакетам GoTipe: TypeScript-интерфейсы, сигнатуры, примеры, конфигурация exports.

Source of truth для Rust-типов: [03-editor-core.md](03-editor-core.md). Здесь описаны TypeScript-биндинги поверх WASM.

---

## Содержание

- [Типы данных (core interfaces)](#типы-данных-core-interfaces)
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

## Типы данных (core interfaces)

Все типы определены в `@gotipe/core` и реэкспортируются из каждого адаптера. Зеркало Rust-типов из [03-editor-core.md](03-editor-core.md).

### AttrValue

```typescript
// packages/core/src/types/attr.ts

export type AttrValue = string | number | boolean | null;
```

### Mark

```typescript
// packages/core/src/types/mark.ts

export interface Mark {
  /** Тип mark: "bold", "italic", "link" и т.д. */
  readonly type: string;
  /** Атрибуты mark (href для link, color для highlight) */
  readonly attrs: Record<string, AttrValue>;
}
```

### TextSpan

```typescript
// packages/core/src/types/text-span.ts

export interface TextSpan {
  /** Текстовое содержимое span */
  readonly text: string;
  /** Inline marks, применённые к span */
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
  /** Уникальный идентификатор (UUID v7) */
  readonly id: string;
  /** Тип блока: "paragraph", "heading", "codeBlock" и т.д. */
  readonly type: string;
  /** Атрибуты блока (level для heading, language для codeBlock) */
  readonly attrs: Record<string, AttrValue>;
  /** Содержимое блока */
  readonly content: BlockContent;
  /** Вложенные блоки (list items, table rows, columns) */
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

### Step и Transaction

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
  /** Атомарные шаги трансформации */
  readonly steps: readonly Step[];
  /** Новая позиция курсора (null = автомаппинг) */
  readonly selection: Selection | null;
  /** Метаданные (источник, timestamp, ...) */
  readonly metadata: Record<string, AttrValue>;
}
```

### EditorState

```typescript
// packages/core/src/types/state.ts

export interface EditorState {
  /** Документ — дерево блоков */
  readonly doc: {
    readonly blocks: readonly Block[];
    readonly version: number;
  };
  /** Текущая позиция курсора / выделение */
  readonly selection: Selection;
  /** Schema, с которой создан editor */
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
  /** Список extensions (определяют schema, команды, keybindings) */
  extensions: Extension[];

  /** Начальный контент (JSON-документ или HTML-строка) */
  content?: Block[] | string;

  /** Режим только для чтения */
  editable?: boolean;

  /** CSS-класс для корневого элемента */
  editorClass?: string;

  /** Callback при каждом обновлении документа */
  onUpdate?: (props: { editor: GoTipeEditor; transaction: Transaction }) => void;

  /** Callback при изменении selection */
  onSelectionUpdate?: (props: { editor: GoTipeEditor; selection: Selection }) => void;

  /** Callback при создании editor */
  onCreate?: (props: { editor: GoTipeEditor }) => void;

  /** Callback при уничтожении editor */
  onDestroy?: () => void;

  /** Callback при focus/blur */
  onFocus?: (props: { editor: GoTipeEditor; event: FocusEvent }) => void;
  onBlur?: (props: { editor: GoTipeEditor; event: FocusEvent }) => void;

  /** Callback перед каждой транзакцией (return false для отмены) */
  onBeforeTransaction?: (props: { editor: GoTipeEditor; transaction: Transaction }) => boolean;

  /** Автофокус при создании */
  autofocus?: boolean | 'start' | 'end';

  /** Inline-стили для editor container */
  editorStyle?: Record<string, string>;
}
```

### GoTipeEditor (main editor class)

```typescript
// packages/core/src/types/editor.ts

export interface GoTipeEditor {
  // --- State ---

  /** Текущее состояние редактора (immutable snapshot) */
  readonly state: EditorState;

  /** Schema текущего editor */
  readonly schema: Schema;

  /** true, если editor не уничтожен */
  readonly isActive: boolean;

  /** true, если editor в режиме "только для чтения" */
  readonly isEditable: boolean;

  // --- Document access ---

  /** Получить документ как JSON */
  getJSON(): { blocks: Block[]; version: number };

  /** Получить документ как HTML */
  getHTML(): string;

  /** Получить plain text */
  getText(): string;

  /** Найти блок по ID */
  getBlock(blockId: string): Block | null;

  /** Проверить, пуст ли документ */
  isEmpty(): boolean;

  // --- Chainable command API ---

  /**
   * Начать цепочку команд.
   * Каждый метод chain возвращает this.
   * `.run()` применяет накопленную Transaction.
   */
  chain(): ChainableCommands;

  // --- Direct commands ---

  /** Применить произвольную Transaction */
  dispatch(transaction: Transaction): void;

  /** Undo последнее действие */
  undo(): boolean;

  /** Redo отменённое действие */
  redo(): boolean;

  /** Установить editable/readonly */
  setEditable(editable: boolean): void;

  /** Установить фокус */
  focus(position?: 'start' | 'end' | number): void;

  /** Убрать фокус */
  blur(): void;

  // --- Events ---

  /** Подписаться на событие */
  on<K extends keyof EditorEvents>(event: K, handler: EditorEvents[K]): () => void;

  /** Отписаться от события */
  off<K extends keyof EditorEvents>(event: K, handler: EditorEvents[K]): void;

  /** Emit событие */
  emit<K extends keyof EditorEvents>(event: K, ...args: Parameters<EditorEvents[K]>): void;

  // --- Lifecycle ---

  /** Уничтожить editor, освободить WASM-память */
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
  /** Применить все накопленные команды как одну Transaction */
  run(): boolean;
}
```

---

## @gotipe/core

Headless editor core. TypeScript-обёртка над Rust/WASM engine. Не зависит от фреймворка.

| | |
|---|---|
| **npm** | `@gotipe/core` |
| **Bundle size (gzip)** | ~18 KB (JS bindings) + ~255 KB (WASM binary) |
| **Зависимости** | `@gotipe/wasm` |
| **Документация** | [01-architecture.md](01-architecture.md), [03-editor-core.md](03-editor-core.md), [05-extensions.md](05-extensions.md) |

### Key exports

```typescript
// packages/core/src/index.ts

/** Создать editor instance */
export function createEditor(options: EditorOptions): GoTipeEditor;

/** Инициализировать WASM engine (вызывается автоматически при createEditor) */
export function initGoTipe(): Promise<void>;

/** Определить extension */
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

### Пример

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

React 18+ adapter. Компоненты и hooks для подключения GoTipe к React-приложению.

| | |
|---|---|
| **npm** | `@gotipe/react` |
| **Bundle size (gzip)** | ~6 KB |
| **Peer dependencies** | `react >=18`, `react-dom >=18`, `@gotipe/core` |
| **Документация** | [06-framework-adapters.md](06-framework-adapters.md) |

### Key exports

```typescript
// packages/react/src/index.ts

// --- Hooks ---

/**
 * Создать GoTipeEditor и привязать к React lifecycle.
 * Возвращает editor instance. WASM инициализируется автоматически.
 */
export function useEditor(options: EditorOptions, deps?: any[]): GoTipeEditor | null;

/**
 * Подписка на EditorState с selector.
 * Re-render только при изменении возвращаемого значения (shallow equal).
 */
export function useEditorState<T>(
  editor: GoTipeEditor | null,
  selector: (state: EditorState) => T,
): T | undefined;

/**
 * Подписка на collaboration awareness (курсоры, presence).
 * Работает только при подключённом @gotipe/collaboration.
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

/** Корневой компонент editor — рендерит блоки, обрабатывает ввод */
export const Editor: React.FC<EditorProps>;

export interface BubbleMenuProps {
  editor: GoTipeEditor | null;
  /** Показывать при текстовом выделении */
  shouldShow?: (props: { editor: GoTipeEditor; state: EditorState }) => boolean;
  /** Смещение от выделения (px) */
  offset?: { x?: number; y?: number };
  children: React.ReactNode;
}

/** Floating toolbar, появляющийся при выделении текста */
export const BubbleMenu: React.FC<BubbleMenuProps>;

export interface FloatingMenuProps {
  editor: GoTipeEditor | null;
  /** Показывать при пустом блоке */
  shouldShow?: (props: { editor: GoTipeEditor; state: EditorState }) => boolean;
  children: React.ReactNode;
}

/** Floating menu, появляющийся слева от пустого блока */
export const FloatingMenu: React.FC<FloatingMenuProps>;

export interface BlockToolbarProps {
  editor: GoTipeEditor | null;
  /** Drag handle + block type menu */
  children?: React.ReactNode;
}

/** Toolbar для каждого блока (drag handle, type menu) */
export const BlockToolbar: React.FC<BlockToolbarProps>;
```

### Пример

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

Vue 3 adapter. Composables и компоненты.

| | |
|---|---|
| **npm** | `@gotipe/vue` |
| **Bundle size (gzip)** | ~5 KB |
| **Peer dependencies** | `vue >=3.4`, `@gotipe/core` |
| **Документация** | [06-framework-adapters.md](06-framework-adapters.md) |

### Key exports

```typescript
// packages/vue/src/index.ts

/**
 * Composable: создать editor, привязать к component lifecycle.
 * Возвращает ShallowRef<GoTipeEditor | null>.
 */
export function useEditor(options: MaybeRefOrGetter<EditorOptions>): ShallowRef<GoTipeEditor | null>;

/**
 * Composable: подписка на state с selector.
 * Возвращает computed ref.
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

### Пример

```vue
<script setup lang="ts">
import { useEditor } from '@gotipe/vue';
import { GoTipeEditorComponent as Editor, BubbleMenu } from '@gotipe/vue';
import { DefaultPreset } from '@gotipe/core';

const editor = useEditor({ extensions: DefaultPreset, content: '<p>Привет</p>' });
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
| **Документация** | [06-framework-adapters.md](06-framework-adapters.md) |

### Key exports

```typescript
// packages/svelte/src/index.ts

/**
 * Создать editor instance как $state rune.
 * Автоматический cleanup при destroy компонента.
 */
export function createEditorState(options: EditorOptions): {
  /** $state: editor instance (null пока WASM грузится) */
  readonly editor: GoTipeEditor | null;
  /** $derived: текущее состояние */
  readonly state: EditorState | undefined;
  /** $derived: is editor ready */
  readonly isReady: boolean;
};

/**
 * Подписка на EditorState с selector.
 * Возвращает $derived rune.
 */
export function useEditorState<T>(
  editor: GoTipeEditor | null,
  selector: (state: EditorState) => T,
): { readonly value: T | undefined };
```

### Компоненты

```
Editor.svelte        — корневой editor
BubbleMenu.svelte    — floating toolbar при выделении
FloatingMenu.svelte  — menu для пустого блока
BlockToolbar.svelte  — drag handle + block menu
```

### Пример

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
| **Документация** | [06-framework-adapters.md](06-framework-adapters.md) |

### Key exports

```typescript
// packages/solid/src/index.ts

import type { Accessor } from 'solid-js';

/**
 * Создать editor instance как signal.
 * Автоматический cleanup через onCleanup.
 */
export function createEditor(options: EditorOptions | Accessor<EditorOptions>): Accessor<GoTipeEditor | null>;

/**
 * Подписка на EditorState с selector.
 * Возвращает memo signal — re-compute только при изменении slice.
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

### Пример

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

CRDT sync client. Подключает editor к sync-серверу или WebRTC для real-time collaboration.

| | |
|---|---|
| **npm** | `@gotipe/collaboration` |
| **Bundle size (gzip)** | ~8 KB (JS client; CRDT engine в WASM — уже в @gotipe/core) |
| **Peer dependencies** | `@gotipe/core` |
| **Документация** | [02-collaboration.md](02-collaboration.md) |

### Key exports

```typescript
// packages/collaboration/src/index.ts

import type { Extension, GoTipeEditor } from '@gotipe/core';

// --- Extension ---

export interface CollaborationOptions {
  /** URL WebSocket sync server */
  serverUrl: string;
  /** Идентификатор документа */
  documentId: string;
  /** Имя/цвет текущего пользователя (awareness) */
  user?: { name: string; color: string; avatar?: string };
  /** Auth token (передаётся в WebSocket handshake) */
  token?: string;
  /** Reconnect стратегия */
  reconnect?: { maxRetries?: number; baseDelay?: number; maxDelay?: number };
}

/** Extension для CRDT collaboration через WebSocket */
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

/** WebSocket provider — подключение к GoTipe Sync Server */
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

/** WebRTC provider — peer-to-peer без сервера */
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

### Пример

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
| **Bundle size (gzip)** | ~6 KB (JS client; context builder в WASM) |
| **Peer dependencies** | `@gotipe/core` |
| **Документация** | [07-ai.md](07-ai.md) |

### Key exports

```typescript
// packages/ai/src/index.ts

import type { Extension, GoTipeEditor, Block } from '@gotipe/core';

// --- Extension ---

export interface AIOptions {
  /** AI provider конфигурация */
  provider: AIProvider;
  /** Горячая клавиша для accept ghost text (default: Tab) */
  acceptKey?: string;
  /** Горячая клавиша для dismiss ghost text (default: Escape) */
  dismissKey?: string;
  /** Debounce для inline suggestions (ms, default: 500) */
  debounceMs?: number;
  /** Максимум tokens для контекста (default: 4096) */
  maxContextTokens?: number;
}

/** Extension для inline AI suggestions (ghost text) */
export const AIInline: Extension<AIOptions>;

/** Extension для AI slash commands (/ai rewrite, /ai expand, ...) */
export const AICommands: Extension<AIOptions>;

// --- Provider interface ---

export interface AIProvider {
  /** Идентификатор провайдера */
  readonly name: string;

  /**
   * Inline completion (ghost text).
   * Возвращает stream текста.
   */
  complete(params: {
    /** Текст до курсора */
    prefix: string;
    /** Текст после курсора */
    suffix: string;
    /** Окружающие блоки (контекст) */
    context: Block[];
    /** AbortSignal для отмены */
    signal: AbortSignal;
  }): AsyncIterable<string>;

  /**
   * AI command (rewrite, expand, translate, ...).
   * Возвращает stream текста.
   */
  command(params: {
    /** Тип команды */
    command: 'rewrite' | 'expand' | 'summarize' | 'translate' | 'fixGrammar' | 'changeTone' | string;
    /** Входной текст */
    input: string;
    /** Дополнительные инструкции */
    instructions?: string;
    /** Контекст документа */
    context: Block[];
    /** Язык для translate */
    language?: string;
    /** Тон для changeTone */
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

/** GoTipe Cloud AI proxy (маршрутизация через GoTipe Cloud) */
export function createGoTipeCloudProvider(opts: {
  apiKey: string;
}): AIProvider;
```

### Пример

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

// Программный вызов AI command
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

Document conversion. Client-side (WASM) для HTML/Markdown, server-side или lazy-load для PDF/DOCX.

| | |
|---|---|
| **npm** | `@gotipe/export` |
| **Bundle size (gzip)** | ~4 KB (JS bindings); HTML+MD конвертеры в WASM (~40 KB, уже в @gotipe/core); PDF (+~400 KB lazy), DOCX (+~60 KB lazy) |
| **Peer dependencies** | `@gotipe/core` |
| **Документация** | [08-export-import.md](08-export-import.md) |

### Key exports

```typescript
// packages/export/src/index.ts

import type { Block } from '@gotipe/core';

export interface ExportOptions {
  /** Включать inline-стили в HTML (default: true) */
  inlineStyles?: boolean;
  /** Custom CSS для PDF export */
  css?: string;
  /** Metadata для PDF/DOCX (автор, заголовок) */
  metadata?: {
    title?: string;
    author?: string;
    subject?: string;
    createdAt?: Date;
  };
}

/**
 * Экспорт документа в HTML-строку.
 * Синхронный — работает через WASM.
 */
export function exportHTML(blocks: readonly Block[], options?: ExportOptions): string;

/**
 * Экспорт документа в Markdown-строку.
 * Синхронный — работает через WASM.
 */
export function exportMarkdown(blocks: readonly Block[], options?: ExportOptions): string;

/**
 * Экспорт документа в PDF (Uint8Array).
 * Lazy-load: WASM-модуль typst загружается при первом вызове.
 */
export function exportPDF(blocks: readonly Block[], options?: ExportOptions): Promise<Uint8Array>;

/**
 * Экспорт документа в DOCX (Uint8Array).
 * Lazy-load: WASM-модуль docx-rs загружается при первом вызове.
 */
export function exportDOCX(blocks: readonly Block[], options?: ExportOptions): Promise<Uint8Array>;

/**
 * Импорт HTML-строки в массив Block.
 * Синхронный — парсинг через WASM.
 */
export function importHTML(html: string): Block[];

/**
 * Импорт Markdown-строки в массив Block.
 * Синхронный — парсинг через WASM.
 */
export function importMarkdown(markdown: string): Block[];

/** Хелпер: скачать файл в браузере */
export function downloadBlob(data: Uint8Array | string, filename: string, mimeType: string): void;
```

### Пример

```typescript
import { exportPDF, exportMarkdown, downloadBlob } from '@gotipe/export';

const blocks = editor.getJSON().blocks;

// Markdown — синхронный
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

Все ошибки GoTipe наследуют от `GoTipeError`. Код ошибки — строковый enum для pattern matching.

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

### Паттерны обработки

```typescript
import { GoTipeError } from '@gotipe/core';

// 1. try/catch с проверкой кода
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

// 2. onBeforeTransaction — предотвращение невалидных транзакций
const editor = createEditor({
  extensions: DefaultPreset,
  onBeforeTransaction: ({ transaction }) => {
    // return false для отмены транзакции
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

// 4. AI error handling с AbortController
const controller = new AbortController();
setTimeout(() => controller.abort(), 10_000); // timeout 10s

try {
  for await (const chunk of ai.complete({ prefix, suffix, context: [], signal: controller.signal })) {
    appendGhostText(chunk);
  }
} catch (e) {
  if (e instanceof DOMException && e.name === 'AbortError') {
    // Таймаут или отмена пользователем — ожидаемо
  } else {
    console.error('AI provider error:', e);
  }
}
```

### WASM initialization errors

```typescript
import { initGoTipe } from '@gotipe/core';

// WASM загрузка может упасть (CSP, unsupported browser, network error)
try {
  await initGoTipe();
} catch (e) {
  if (e instanceof GoTipeError && e.code === 'WASM_INIT_FAILED') {
    // Fallback на JS engine
    const { initGoTipeJS } from '@gotipe/core-js';
    await initGoTipeJS();
  }
}
```

---

## package.json exports

Сводная таблица exports по всем пакетам. Все пакеты используют [conditional exports](https://nodejs.org/api/packages.html#conditional-exports) и dual CJS/ESM.

| Пакет | Entry point | Types | ESM | CJS |
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

### Шаблон exports поля

```jsonc
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",     // TypeScript — всегда первым
      "import": "./dist/index.mjs",      // ESM
      "require": "./dist/index.cjs"      // CJS (опционально)
    },
    "./subpath": {
      "types": "./dist/subpath.d.ts",
      "import": "./dist/subpath.mjs",
      "require": "./dist/subpath.cjs"
    }
  }
}
```

Правила:
1. `"types"` condition всегда первым — TypeScript резолвит сверху вниз
2. `"import"` для ESM bundlers (Vite, Rollup, esbuild, Node ESM)
3. `"require"` для CJS (Node, Jest без ESM transform)
4. `"svelte"` / `"solid"` conditions для framework-specific resolvers
5. `"sideEffects": false` — tree-shaking для всех пакетов

---

## Связанные документы

- [01-architecture.md](01-architecture.md) -- архитектура системы, WASM layer, document model
- [03-editor-core.md](03-editor-core.md) -- Rust-типы (source of truth), wasm-bindgen API, benchmarks
- [05-extensions.md](05-extensions.md) -- extension API, defineExtension, built-in extensions
- [06-framework-adapters.md](06-framework-adapters.md) -- детали rendering, virtual DOM, custom block renderers
