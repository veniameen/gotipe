# GoTipe — Framework Integration

> **Historical specification, not a guide to the current API.** The examples, timelines,
> performance comparisons, commercial terms and promises below do not confirm an
> implementation or service availability. Current: [contracts](development/editor-contracts.md),
> [code map](development/code-map.md), [checks](development/testing.md),
> [release plan](22-release-readiness.md). Licenses are defined by `LICENSE` and each
> package's manifest, not by this document.

## Overview

GoTipe is a framework-agnostic editor. Core (`@gotipe/core` + `gotipe-wasm`) knows nothing about React, Vue, Svelte or Solid. The core emits `ViewState`, plain JS objects. A thin adapter layer converts `ViewState` into framework-specific components and translates DOM events back into commands/transactions.

```
┌───────────────────────────────────────────────────────────────┐
│                       @gotipe/core                             │
│                                                               │
│  EditorState ──► ViewState (plain JS objects)                 │
│                                                               │
│  ViewState = {                                                │
│    blocks: BlockView[],     // block tree for rendering        │
│    selection: SelectionView,// cursor + selection ranges       │
│    decorations: Decoration[], // placeholder, AI ghost text   │
│    toolbar: ToolbarState,   // active marks, active block type │
│  }                                                            │
│                                                               │
│  Core exports:                                                │
│    createEditor(config) → GoTipeEditor                        │
│    GoTipeEditor.on('update', cb) → unsubscribe                │
│    GoTipeEditor.getViewState() → ViewState                    │
│    GoTipeEditor.chain().toggleBold().run()                     │
└──────────────────────────┬────────────────────────────────────┘
                           │ ViewState (plain JS objects)
                           ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐
│  React   │ │  Vue 3   │ │ Svelte 5 │ │  Solid   │ │ Vanilla │
│ Adapter  │ │ Adapter  │ │ Adapter  │ │ Adapter  │ │   JS    │
│          │ │          │ │          │ │          │ │         │
│@gotipe/  │ │@gotipe/  │ │@gotipe/  │ │@gotipe/  │ │@gotipe/ │
│  react   │ │  vue     │ │  svelte  │ │  solid   │ │  core   │
└──────────┘ └──────────┘ └──────────┘ └──────────┘ └─────────┘
```

**Key principle:** core does NOT import `react`, `vue`, `svelte`, `solid-js`. The adapter is the only place where a framework dependency appears. Switching frameworks = replacing one package.

Related documents:
- [01-architecture.md](01-architecture.md) — rendering architecture, ViewState pipeline
- [04-block-editor.md](04-block-editor.md) — block types, slash commands, drag-and-drop
- [05-extensions.md](05-extensions.md) — extension presets, custom extensions
- [09-sdk-and-api.md](09-sdk-and-api.md) — packages, types, bundle sizes

---

## Packages

| Package | Purpose | Peer Dependencies | Size (gzip) |
|-------|-----------|-------------------|-------------|
| `@gotipe/core` | Editor engine, extensions, ViewState | — | ~30KB |
| `@gotipe/wasm` | Rust/WASM core (schema, transforms, CRDT) | — | ~255KB |
| `@gotipe/react` | React 18/19 adapter | `react >=18`, `react-dom >=18` | ~8KB |
| `@gotipe/vue` | Vue 3.3+ adapter | `vue >=3.3` | ~6KB |
| `@gotipe/svelte` | Svelte 5 adapter | `svelte >=5` | ~4KB |
| `@gotipe/solid` | Solid 1.8+ adapter | `solid-js >=1.8` | ~5KB |

All adapters depend on `@gotipe/core` as a peer dependency.

---

## ViewState Contract

All adapters consume the same `ViewState`. Core knows nothing about the DOM: ViewState contains only data.

```typescript
// packages/core/src/view-state.ts

export interface ViewState {
  /** Block tree for rendering */
  blocks: BlockView[];
  /** Current selection */
  selection: SelectionView;
  /** Decorations (placeholder, ghost text, remote cursors) */
  decorations: Decoration[];
  /** Toolbar state (which marks are active) */
  toolbar: ToolbarState;
  /** Document version */
  version: number;
}

export interface BlockView {
  id: string;
  type: string;
  attrs: Record<string, unknown>;
  content: TextSpanView[] | string | null;
  children: BlockView[];
  /** Decorations applied to this block */
  decorations: Decoration[];
}

export interface TextSpanView {
  text: string;
  marks: MarkView[];
}

export interface MarkView {
  type: string;
  attrs: Record<string, unknown>;
}

export interface SelectionView {
  type: 'text' | 'block' | 'multi';
  anchor: { blockId: string; offset: number };
  head: { blockId: string; offset: number };
}

export interface ToolbarState {
  /** Active marks in the current selection */
  activeMarks: string[];
  /** Type of the current block */
  activeBlockType: string;
  /** Attributes of the current block */
  activeBlockAttrs: Record<string, unknown>;
  /** Whether undo is possible */
  canUndo: boolean;
  /** Whether redo is possible */
  canRedo: boolean;
}
```

---

## 1. React

### Installation

```bash
npm install @gotipe/core @gotipe/react
```

### Quick Start (5 lines)

```tsx
import { useEditor, Editor } from '@gotipe/react';
import { DefaultPreset } from '@gotipe/core/presets';

export default function App() {
  const editor = useEditor({ extensions: DefaultPreset });
  return <Editor editor={editor} />;
}
```

### Hooks

#### `useEditor`

Creates and manages the lifecycle of a `GoTipeEditor` instance. Initializes WASM, builds the schema from extensions, creates the editor.

```typescript
// packages/react/src/hooks/useEditor.ts

export interface UseEditorOptions {
  /** Extensions (nodes, marks, behaviors) */
  extensions: Extension[];
  /** Initial content (JSON, HTML, Markdown) */
  content?: string | object;
  /** Editable */
  editable?: boolean;
  /** Autofocus */
  autofocus?: boolean | 'start' | 'end';
  /** Callbacks */
  onUpdate?: (props: { editor: GoTipeEditor }) => void;
  onSelectionChange?: (props: { editor: GoTipeEditor }) => void;
  onFocus?: (props: { editor: GoTipeEditor }) => void;
  onBlur?: (props: { editor: GoTipeEditor }) => void;
  onCreate?: (props: { editor: GoTipeEditor }) => void;
  onDestroy?: (props: { editor: GoTipeEditor }) => void;
}

export function useEditor(options: UseEditorOptions): GoTipeEditor | null;
```

| Parameter | Type | Default | Description |
|----------|-----|---------|----------|
| `extensions` | `Extension[]` | **required** | Set of extensions. Use the presets from [05-extensions.md](05-extensions.md) |
| `content` | `string \| object` | `undefined` | JSON object, HTML string or Markdown |
| `editable` | `boolean` | `true` | Read-only mode when `false` |
| `autofocus` | `boolean \| 'start' \| 'end'` | `false` | Autofocus on mount |
| `onUpdate` | `(props) => void` | — | Called on every document change |
| `onSelectionChange` | `(props) => void` | — | Called when the selection changes |

```tsx
function MyEditor() {
  const [output, setOutput] = useState('');

  const editor = useEditor({
    extensions: DefaultPreset,
    content: '<p>Hello <strong>GoTipe</strong></p>',
    autofocus: 'end',
    onUpdate: ({ editor }) => {
      setOutput(JSON.stringify(editor.getJSON(), null, 2));
    },
  });

  if (!editor) return <div>Loading WASM...</div>;

  return (
    <div>
      <Editor editor={editor} />
      <pre>{output}</pre>
    </div>
  );
}
```

#### `useEditorState`

Subscribes to specific parts of ViewState. Uses `useSyncExternalStore` to integrate with React concurrent mode. Re-renders only when the selected slice changes.

```typescript
export function useEditorState<T>(
  editor: GoTipeEditor | null,
  selector: (state: ViewState) => T,
  isEqual?: (a: T, b: T) => boolean,
): T | undefined;
```

```tsx
function WordCount({ editor }: { editor: GoTipeEditor }) {
  const wordCount = useEditorState(editor, (state) =>
    state.blocks.reduce((acc, block) => {
      if (Array.isArray(block.content)) {
        return acc + block.content.reduce((a, span) =>
          a + span.text.split(/\s+/).filter(Boolean).length, 0
        );
      }
      return acc;
    }, 0)
  );

  return <span>{wordCount} words</span>;
}

function ActiveMarks({ editor }: { editor: GoTipeEditor }) {
  const activeMarks = useEditorState(
    editor,
    (state) => state.toolbar.activeMarks,
    (a, b) => a.join(',') === b.join(','), // custom equality
  );

  return (
    <div>
      {activeMarks?.map((mark) => (
        <span key={mark} className="active-mark">{mark}</span>
      ))}
    </div>
  );
}
```

### Components

#### `<Editor />`

The main component. Renders the block tree, manages DOM events, contentEditable.

```typescript
export interface EditorProps {
  /** GoTipeEditor instance from useEditor */
  editor: GoTipeEditor | null;
  /** CSS class */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
  /** Custom block renderer */
  blockRenderer?: (props: BlockRendererProps) => React.ReactNode;
  /** Slot: before editor content */
  slotBefore?: React.ReactNode;
  /** Slot: after editor content */
  slotAfter?: React.ReactNode;
  /** Children: BubbleMenu, FloatingMenu, etc. */
  children?: React.ReactNode;
}
```

```tsx
<Editor
  editor={editor}
  className="my-editor"
  slotBefore={<Toolbar editor={editor} />}
  slotAfter={<CharacterCount editor={editor} />}
>
  <BubbleMenu editor={editor}>
    {({ editor }) => <InlineToolbar editor={editor} />}
  </BubbleMenu>
  <FloatingMenu editor={editor}>
    {({ editor }) => <BlockInsertMenu editor={editor} />}
  </FloatingMenu>
</Editor>
```

#### `<BubbleMenu />`

A floating toolbar that appears when text is selected. Positioned automatically relative to the selection.

```typescript
export interface BubbleMenuProps {
  editor: GoTipeEditor;
  /** Show condition (default: there is a text selection) */
  shouldShow?: (props: { editor: GoTipeEditor; state: ViewState }) => boolean;
  /** Offset from the selection in pixels */
  offset?: { x: number; y: number };
  /** Render function */
  children: (props: { editor: GoTipeEditor }) => React.ReactNode;
}
```

```tsx
<BubbleMenu
  editor={editor}
  shouldShow={({ state }) =>
    state.selection.type === 'text' &&
    state.selection.anchor.blockId === state.selection.head.blockId
  }
>
  {({ editor }) => (
    <div className="bubble-toolbar">
      <button
        onClick={() => editor.chain().toggleBold().run()}
        data-active={editor.isActive('bold')}
      >
        B
      </button>
      <button
        onClick={() => editor.chain().toggleItalic().run()}
        data-active={editor.isActive('italic')}
      >
        I
      </button>
      <button onClick={() => editor.chain().toggleCode().run()}>
        {'</>'}
      </button>
    </div>
  )}
</BubbleMenu>
```

#### `<FloatingMenu />`

A menu that appears next to an empty block. Used for inserting new block types.

```typescript
export interface FloatingMenuProps {
  editor: GoTipeEditor;
  /** Show condition (default: cursor is in an empty paragraph) */
  shouldShow?: (props: { editor: GoTipeEditor; state: ViewState }) => boolean;
  children: (props: { editor: GoTipeEditor }) => React.ReactNode;
}
```

```tsx
<FloatingMenu
  editor={editor}
  shouldShow={({ editor, state }) => {
    const block = editor.getCurrentBlock();
    return block?.type === 'paragraph' && block.isEmpty;
  }}
>
  {({ editor }) => (
    <div className="floating-menu">
      <button onClick={() => editor.chain().setBlockType('heading', { level: 1 }).run()}>
        H1
      </button>
      <button onClick={() => editor.chain().toggleBulletList().run()}>
        List
      </button>
      <button onClick={() => editor.chain().insertBlockAfter('image').run()}>
        Image
      </button>
    </div>
  )}
</FloatingMenu>
```

#### Custom Block Renderer

For custom rendering of specific block types.

```tsx
import { Editor, BlockRendererProps } from '@gotipe/react';

function CustomBlockRenderer({ block, children, editor }: BlockRendererProps) {
  switch (block.type) {
    case 'callout':
      return (
        <div className={`callout callout-${block.attrs.emoji}`}>
          <span className="callout-icon">{block.attrs.emoji as string}</span>
          <div className="callout-content">{children}</div>
        </div>
      );
    case 'codeBlock':
      return (
        <pre data-language={block.attrs.language}>
          <code>{children}</code>
          <CopyButton text={block.content as string} />
        </pre>
      );
    default:
      return null; // fallback to the default renderer
  }
}

<Editor editor={editor} blockRenderer={CustomBlockRenderer} />
```

### React Server Components

`@gotipe/react` supports React Server Components (RSC). Server components use `@gotipe/core` directly to render HTML, with no client JS.

```tsx
// app/article/[id]/page.tsx (Next.js App Router — Server Component)
import { renderToHtml } from '@gotipe/core/server';

export default async function ArticlePage({ params }: { params: { id: string } }) {
  const doc = await db.getDocument(params.id);

  // Rendering on the server: WASM core in Node.js, zero client JS
  const html = await renderToHtml(doc.content);

  return (
    <article
      className="gotipe-content"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
```

For interactive editing, use a client component:

```tsx
// app/article/[id]/edit/page.tsx
'use client';

import { useEditor, Editor } from '@gotipe/react';
import { DefaultPreset } from '@gotipe/core/presets';

export default function EditPage({ initialContent }: { initialContent: object }) {
  const editor = useEditor({
    extensions: DefaultPreset,
    content: initialContent,
  });

  return <Editor editor={editor} />;
}
```

### Props, Events, Slots

| Prop | Type | Description |
|------|-----|----------|
| `editor` | `GoTipeEditor \| null` | Editor instance |
| `className` | `string` | CSS class on the container |
| `style` | `CSSProperties` | Inline styles |
| `blockRenderer` | `(props) => ReactNode` | Custom renderer for blocks |
| `slotBefore` | `ReactNode` | Content before the editor (toolbar) |
| `slotAfter` | `ReactNode` | Content after the editor (word count) |
| `children` | `ReactNode` | BubbleMenu, FloatingMenu, etc. |

| Event (via useEditor) | When it fires |
|--------------------------|-------------------|
| `onUpdate` | The document changed (user input, API) |
| `onSelectionChange` | The selection/cursor changed |
| `onFocus` | The editor received focus |
| `onBlur` | The editor lost focus |
| `onCreate` | The editor was initialized |
| `onDestroy` | The editor was destroyed |

### Styling

```tsx
// Option 1: import the default styles
import '@gotipe/react/styles.css';

// Option 2: base only (no theme)
import '@gotipe/react/styles/base.css';

// Option 3: headless, no styles, everything custom
// Import nothing, use the CSS variables from 04-block-editor.md

// Option 4: Tailwind
<Editor editor={editor} className="prose max-w-none" />
```

---

## 2. Vue 3

### Installation

```bash
npm install @gotipe/core @gotipe/vue
```

### Quick Start (5 lines)

```vue
<script setup lang="ts">
import { useEditor, Editor } from '@gotipe/vue';
import { DefaultPreset } from '@gotipe/core/presets';

const editor = useEditor({ extensions: DefaultPreset });
</script>

<template>
  <Editor :editor="editor" />
</template>
```

### Composables

#### `useEditor`

Returns `ShallowRef<GoTipeEditor | null>`. Uses `shallowRef`: the editor object itself is not reactive, but the ref is updated on initialization. Lifecycle (onMounted, onBeforeUnmount) is managed automatically.

```typescript
// packages/vue/src/composables/useEditor.ts

export function useEditor(options: UseEditorOptions): ShallowRef<GoTipeEditor | null>;
```

```vue
<script setup lang="ts">
import { useEditor, Editor, BubbleMenu } from '@gotipe/vue';
import { DefaultPreset } from '@gotipe/core/presets';
import { ref, watch } from 'vue';

const content = ref('<p>Hello <strong>Vue</strong></p>');
const output = ref('');

const editor = useEditor({
  extensions: DefaultPreset,
  content: content.value,
  onUpdate: ({ editor }) => {
    output.value = JSON.stringify(editor.getJSON(), null, 2);
  },
});
</script>

<template>
  <div v-if="editor">
    <Editor :editor="editor">
      <template #before>
        <Toolbar :editor="editor" />
      </template>

      <BubbleMenu :editor="editor">
        <button
          @click="editor.chain().toggleBold().run()"
          :class="{ active: editor.isActive('bold') }"
        >
          B
        </button>
        <button
          @click="editor.chain().toggleItalic().run()"
          :class="{ active: editor.isActive('italic') }"
        >
          I
        </button>
      </BubbleMenu>

      <template #after>
        <pre>{{ output }}</pre>
      </template>
    </Editor>
  </div>
  <div v-else>Loading WASM...</div>
</template>
```

#### `useEditorState`

Subscribes to a ViewState slice. Returns `ComputedRef<T>`. Updates only when the selected slice changes.

```typescript
export function useEditorState<T>(
  editor: ShallowRef<GoTipeEditor | null>,
  selector: (state: ViewState) => T,
): ComputedRef<T | undefined>;
```

```vue
<script setup lang="ts">
import { useEditor, useEditorState } from '@gotipe/vue';

const editor = useEditor({ extensions: DefaultPreset });

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

const canUndo = useEditorState(editor, (state) => state.toolbar.canUndo);
const canRedo = useEditorState(editor, (state) => state.toolbar.canRedo);
</script>

<template>
  <div>
    <button :disabled="!canUndo" @click="editor?.chain().undo().run()">Undo</button>
    <button :disabled="!canRedo" @click="editor?.chain().redo().run()">Redo</button>
    <span>{{ wordCount }} words</span>
  </div>
</template>
```

### Components

| Component | Description |
|-----------|----------|
| `<Editor>` | The main editor. Props: `editor`, `class`. Slots: `#before`, `#after`, default (menus) |
| `<BubbleMenu>` | Floating toolbar on selection. Props: `editor`, `shouldShow` |
| `<FloatingMenu>` | Menu at an empty block. Props: `editor`, `shouldShow` |
| `<BlockRenderer>` | Custom block renderer. Props: `block`, `editor` |

### Reactivity Integration

The Vue adapter uses `triggerRef` for optimal updates. The core editor calls a callback when ViewState changes, and the adapter calls `triggerRef` on an internal `shallowRef<ViewState>`:

```typescript
// packages/vue/src/internal/reactivity.ts
import { shallowRef, triggerRef, onMounted, onBeforeUnmount } from 'vue';

export function createReactiveViewState(editor: GoTipeEditor) {
  const viewState = shallowRef(editor.getViewState());

  const unsubscribe = editor.on('viewStateChange', (newState: ViewState) => {
    viewState.value = newState;
    triggerRef(viewState);
  });

  onBeforeUnmount(() => unsubscribe());

  return viewState;
}
```

### Slots

```vue
<Editor :editor="editor">
  <!-- #before: before contentEditable -->
  <template #before>
    <div class="toolbar">...</div>
  </template>

  <!-- default slot: overlay menus -->
  <BubbleMenu :editor="editor">...</BubbleMenu>
  <FloatingMenu :editor="editor">...</FloatingMenu>

  <!-- #after: after contentEditable -->
  <template #after>
    <div class="status-bar">...</div>
  </template>
</Editor>
```

### Styling

```vue
<!-- Default styles -->
<style>
@import '@gotipe/vue/styles.css';
</style>

<!-- Headless: variables only -->
<style>
@import '@gotipe/vue/styles/base.css';
</style>

<!-- Scoped custom styles -->
<style scoped>
.gotipe-editor {
  border: 1px solid var(--gotipe-color-border);
  border-radius: 8px;
  padding: 1rem;
}
</style>
```

---

## 3. Svelte 5

### Installation

```bash
npm install @gotipe/core @gotipe/svelte
```

### Quick Start (5 lines)

```svelte
<script lang="ts">
  import { createEditor, Editor } from '@gotipe/svelte';
  import { DefaultPreset } from '@gotipe/core/presets';

  const editor = createEditor({ extensions: DefaultPreset });
</script>

<Editor {editor} />
```

### Runes Integration

The Svelte 5 adapter uses runes (`$state`, `$derived`, `$effect`) for reactivity. `createEditor` returns a reactive state object.

```typescript
// packages/svelte/src/editor.svelte.ts

export function createEditor(options: EditorOptions): GoTipeEditorState {
  let instance: GoTipeEditor | null = $state(null);
  let viewState: ViewState | null = $state(null);

  $effect(() => {
    // Initialize WASM + editor
    const ed = initEditor(options);
    ed.then((editor) => {
      instance = editor;
      viewState = editor.getViewState();

      editor.on('viewStateChange', (state: ViewState) => {
        viewState = state;
      });
    });

    return () => {
      instance?.destroy();
    };
  });

  return {
    get instance() { return instance; },
    get viewState() { return viewState; },
    get isReady() { return instance !== null; },
  };
}
```

### Full example

```svelte
<script lang="ts">
  import { createEditor, Editor, BubbleMenu, FloatingMenu } from '@gotipe/svelte';
  import { DefaultPreset } from '@gotipe/core/presets';

  const editor = createEditor({
    extensions: DefaultPreset,
    content: '<p>Hello <strong>Svelte 5</strong></p>',
  });

  // $derived: recomputed automatically when viewState changes
  const wordCount = $derived(
    editor.viewState?.blocks.reduce((acc, block) => {
      if (Array.isArray(block.content)) {
        return acc + block.content.reduce(
          (a, span) => a + span.text.split(/\s+/).filter(Boolean).length, 0
        );
      }
      return acc;
    }, 0) ?? 0
  );

  const canUndo = $derived(editor.viewState?.toolbar.canUndo ?? false);
  const canRedo = $derived(editor.viewState?.toolbar.canRedo ?? false);

  function handleUpdate() {
    const json = editor.instance?.getJSON();
    console.log('Document:', json);
  }
</script>

{#if editor.isReady}
  <div class="toolbar">
    <button disabled={!canUndo} onclick={() => editor.instance?.chain().undo().run()}>
      Undo
    </button>
    <button disabled={!canRedo} onclick={() => editor.instance?.chain().redo().run()}>
      Redo
    </button>
    <span>{wordCount} words</span>
  </div>

  <Editor {editor} onupdate={handleUpdate}>
    <BubbleMenu {editor}>
      {#snippet menu(editor)}
        <div class="bubble-toolbar">
          <button
            onclick={() => editor.instance?.chain().toggleBold().run()}
            class:active={editor.instance?.isActive('bold')}
          >
            B
          </button>
          <button
            onclick={() => editor.instance?.chain().toggleItalic().run()}
            class:active={editor.instance?.isActive('italic')}
          >
            I
          </button>
        </div>
      {/snippet}
    </BubbleMenu>
  </Editor>
{:else}
  <p>Loading WASM...</p>
{/if}

<style>
  @import '@gotipe/svelte/styles.css';
</style>
```

### Components

| Component | Props | Description |
|-----------|-------|----------|
| `<Editor>` | `editor`, `class`, `onupdate`, `onfocus`, `onblur` | The main editor |
| `<BubbleMenu>` | `editor`, `shouldShow` | Floating toolbar on selection |
| `<FloatingMenu>` | `editor`, `shouldShow` | Menu at an empty block |

### Custom Block Renderer

```svelte
<script lang="ts">
  import { Editor, type BlockView } from '@gotipe/svelte';

  const { block, children }: { block: BlockView; children: any } = $props();
</script>

{#if block.type === 'callout'}
  <div class="callout">
    <span class="callout-icon">{block.attrs.emoji}</span>
    <div class="callout-content">{@render children()}</div>
  </div>
{:else}
  {@render children()}
{/if}
```

### Styling

```svelte
<!-- Default -->
<style>
  @import '@gotipe/svelte/styles.css';
</style>

<!-- Headless -->
<style>
  :global(.gotipe-editor) {
    max-width: 720px;
    margin: 0 auto;
  }
</style>
```

---

## 4. Solid

### Installation

```bash
npm install @gotipe/core @gotipe/solid
```

### Quick Start (5 lines)

```tsx
import { createEditor, Editor } from '@gotipe/solid';
import { DefaultPreset } from '@gotipe/core/presets';

export default function App() {
  const editor = createEditor({ extensions: DefaultPreset });
  return <Editor editor={editor} />;
}
```

### Signals Integration

The Solid adapter uses `createSignal` and `createResource` for reactivity. The editor's ViewState is a signal, updated through `batch`.

```typescript
// packages/solid/src/createEditor.ts
import { createSignal, createResource, onCleanup, batch } from 'solid-js';

export function createEditor(options: EditorOptions) {
  const [viewState, setViewState] = createSignal<ViewState | null>(null);
  const [instance, setInstance] = createSignal<GoTipeEditor | null>(null);

  const [ready] = createResource(async () => {
    const editor = await initEditor(options);

    batch(() => {
      setInstance(editor);
      setViewState(editor.getViewState());
    });

    editor.on('viewStateChange', (state: ViewState) => {
      setViewState(state);
    });

    onCleanup(() => editor.destroy());

    return true;
  });

  return {
    get instance() { return instance(); },
    get viewState() { return viewState(); },
    get isReady() { return ready() === true; },
  };
}
```

### Full example

```tsx
import { createEditor, Editor, BubbleMenu } from '@gotipe/solid';
import { DefaultPreset } from '@gotipe/core/presets';
import { Show, createMemo } from 'solid-js';

export default function App() {
  const editor = createEditor({
    extensions: DefaultPreset,
    content: '<p>Hello <strong>Solid</strong></p>',
  });

  const wordCount = createMemo(() => {
    const state = editor.viewState;
    if (!state) return 0;
    return state.blocks.reduce((acc, block) => {
      if (Array.isArray(block.content)) {
        return acc + block.content.reduce(
          (a, span) => a + span.text.split(/\s+/).filter(Boolean).length, 0
        );
      }
      return acc;
    }, 0);
  });

  const canUndo = createMemo(() => editor.viewState?.toolbar.canUndo ?? false);

  return (
    <Show when={editor.isReady} fallback={<p>Loading WASM...</p>}>
      <div class="toolbar">
        <button
          disabled={!canUndo()}
          onClick={() => editor.instance?.chain().undo().run()}
        >
          Undo
        </button>
        <span>{wordCount()} words</span>
      </div>

      <Editor editor={editor}>
        <BubbleMenu editor={editor}>
          {(ed) => (
            <div class="bubble-toolbar">
              <button
                onClick={() => ed.chain().toggleBold().run()}
                classList={{ active: ed.isActive('bold') }}
              >
                B
              </button>
              <button
                onClick={() => ed.chain().toggleItalic().run()}
                classList={{ active: ed.isActive('italic') }}
              >
                I
              </button>
            </div>
          )}
        </BubbleMenu>
      </Editor>
    </Show>
  );
}
```

### Components

| Component | Props | Description |
|-----------|-------|----------|
| `<Editor>` | `editor`, `class`, `onUpdate`, `onFocus`, `onBlur` | The main editor |
| `<BubbleMenu>` | `editor`, `shouldShow`, `children: (editor) => JSX` | Floating toolbar |
| `<FloatingMenu>` | `editor`, `shouldShow`, `children: (editor) => JSX` | Menu at an empty block |

### Styling

```tsx
// Default styles
import '@gotipe/solid/styles.css';

// Headless
import '@gotipe/solid/styles/base.css';
```

---

## 5. Vanilla JS

### Installation

```bash
npm install @gotipe/core
```

### Quick Start (5 lines)

```typescript
import { createEditor } from '@gotipe/core';
import { DefaultPreset } from '@gotipe/core/presets';

const editor = await createEditor({ extensions: DefaultPreset });
editor.mount(document.getElementById('editor')!);
editor.setContent('<p>Hello <strong>GoTipe</strong></p>');
```

### Imperative API

The Vanilla JS API is fully imperative. Core renders blocks to the DOM directly, with no virtual DOM.

```typescript
import { createEditor, type GoTipeEditor } from '@gotipe/core';
import { DefaultPreset } from '@gotipe/core/presets';

async function init() {
  const editor: GoTipeEditor = await createEditor({
    extensions: DefaultPreset,
    content: { version: 1, blocks: [] },
  });

  // Mount into a DOM element
  editor.mount(document.getElementById('editor')!);

  // Subscribe to events
  editor.on('update', ({ editor }) => {
    console.log('JSON:', editor.getJSON());
    console.log('HTML:', editor.getHTML());
  });

  editor.on('selectionChange', ({ editor }) => {
    const state = editor.getViewState();
    updateToolbar(state.toolbar);
  });

  // Programmatic API
  editor.chain()
    .insertBlockAfter('heading', { level: 1 })
    .insertText('Hello World')
    .run();

  // Read state
  const json = editor.getJSON();
  const html = editor.getHTML();
  const markdown = editor.getMarkdown();

  // Commands
  editor.chain().toggleBold().run();
  editor.chain().setBlockType('heading', { level: 2 }).run();
  editor.chain().undo().run();

  // Destroy
  editor.destroy();
}

function updateToolbar(toolbar: ToolbarState) {
  document.getElementById('btn-bold')?.classList
    .toggle('active', toolbar.activeMarks.includes('bold'));
  document.getElementById('btn-italic')?.classList
    .toggle('active', toolbar.activeMarks.includes('italic'));
  document.getElementById('btn-undo')?.toggleAttribute(
    'disabled', !toolbar.canUndo
  );
}
```

### Vanilla Bubble Menu

```typescript
import { createBubbleMenu, createFloatingMenu } from '@gotipe/core/menus';

const bubble = createBubbleMenu(editor, {
  element: document.getElementById('bubble-menu')!,
  shouldShow: ({ state }) => state.selection.type === 'text',
});

const floating = createFloatingMenu(editor, {
  element: document.getElementById('floating-menu')!,
  shouldShow: ({ editor }) => {
    const block = editor.getCurrentBlock();
    return block?.type === 'paragraph' && block.isEmpty;
  },
});

// Cleanup
bubble.destroy();
floating.destroy();
```

### Events

| Event | Payload | Description |
|-------|---------|----------|
| `update` | `{ editor: GoTipeEditor }` | The document changed |
| `selectionChange` | `{ editor: GoTipeEditor }` | The selection changed |
| `focus` | `{ editor: GoTipeEditor }` | Focus received |
| `blur` | `{ editor: GoTipeEditor }` | Focus lost |
| `create` | `{ editor: GoTipeEditor }` | The editor was initialized |
| `destroy` | `{ editor: GoTipeEditor }` | The editor was destroyed |
| `viewStateChange` | `ViewState` | ViewState updated (low-level) |

### Styling

```html
<!-- Default styles -->
<link rel="stylesheet" href="node_modules/@gotipe/core/styles.css" />

<!-- Or through a bundler -->
<script>
import '@gotipe/core/styles.css';
</script>
```

---

## 6. Headless API

Headless mode = data only, no UI rendering. Suitable for:
- server-side document processing
- custom renderers (Canvas, WebGL, PDF)
- testing
- CLI tools

### Headless in the browser

```typescript
import { createEditor } from '@gotipe/core';
import { DefaultPreset } from '@gotipe/core/presets';

// Without .mount() it is headless, no DOM
const editor = await createEditor({
  extensions: DefaultPreset,
  content: existingDocument,
});

// Read ViewState as plain objects
const viewState = editor.getViewState();

// Render it ourselves
viewState.blocks.forEach((block) => {
  renderToCanvas(block);       // custom Canvas renderer
  renderToWebGL(block);        // custom WebGL renderer
  renderToCustomDOM(block);    // custom DOM renderer
});

// Subscribe to changes
editor.on('viewStateChange', (state) => {
  rerenderCanvas(state.blocks);
});

// The API works in full
editor.chain().toggleBold().run();
const json = editor.getJSON();
const html = editor.getHTML();
```

### Headless on the server (Node.js)

```typescript
// server/process-document.ts
import { createHeadlessEditor } from '@gotipe/core/server';
import { DefaultPreset } from '@gotipe/core/presets';

// No DOM, no WASM init: pure server-side
const editor = await createHeadlessEditor({
  extensions: DefaultPreset,
});

// Validation
const isValid = editor.validate(userInput);

// Conversion
editor.setContent(userInput);
const html = editor.getHTML();
const markdown = editor.getMarkdown();
const plainText = editor.getText();

// Transformation
editor.setContent(document);
editor.chain().setBlockType('heading', { level: 1 }).run();
const transformed = editor.getJSON();
```

### Headless API Reference

```typescript
// packages/core/src/headless.ts

export interface HeadlessEditor {
  /** Set the content */
  setContent(content: string | object): void;

  /** Get ViewState (plain objects) */
  getViewState(): ViewState;

  /** Export */
  getJSON(): object;
  getHTML(): string;
  getMarkdown(): string;
  getText(): string;

  /** Validate the document */
  validate(content: string | object): ValidationResult;

  /** Commands */
  chain(): ChainedCommands;

  /** Events */
  on(event: string, handler: (...args: any[]) => void): () => void;

  /** Cleanup */
  destroy(): void;
}
```

---

## 7. SSR (Server-Side Rendering)

### General strategy

SSR in GoTipe works in two stages:

1. **Server:** `@gotipe/core/server` renders the document to HTML through the WASM core in Node.js
2. **Client:** the framework adapter hydrates the HTML and wires up interactivity

```
Server (Node.js)                          Client (Browser)
┌───────────────────┐                    ┌───────────────────┐
│ @gotipe/core/server│                    │ @gotipe/react     │
│                   │                    │                   │
│ doc JSON          │     HTML string    │ hydrate()         │
│   ──► WASM core   │ ─────────────────► │   ──► interactive │
│   ──► renderHTML()│                    │       editor      │
└───────────────────┘                    └───────────────────┘
```

### React (Next.js)

```tsx
// app/editor/page.tsx — Server Component
import { renderToHtml } from '@gotipe/core/server';
import { ClientEditor } from './client-editor';

export default async function EditorPage() {
  const doc = await db.getDocument('doc-123');
  const ssrHtml = await renderToHtml(doc.content);

  return (
    <ClientEditor
      initialContent={doc.content}
      ssrHtml={ssrHtml}
    />
  );
}
```

```tsx
// app/editor/client-editor.tsx — Client Component
'use client';

import { useEditor, Editor } from '@gotipe/react';
import { DefaultPreset } from '@gotipe/core/presets';

interface Props {
  initialContent: object;
  ssrHtml: string;
}

export function ClientEditor({ initialContent, ssrHtml }: Props) {
  const editor = useEditor({
    extensions: DefaultPreset,
    content: initialContent,
  });

  // SSR fallback: show server-rendered HTML until hydration
  if (!editor) {
    return (
      <div
        className="gotipe-editor"
        dangerouslySetInnerHTML={{ __html: ssrHtml }}
      />
    );
  }

  return <Editor editor={editor} />;
}
```

### Vue (Nuxt)

```vue
<!-- pages/editor.vue -->
<script setup lang="ts">
import { renderToHtml } from '@gotipe/core/server';
import { useEditor, Editor } from '@gotipe/vue';
import { DefaultPreset } from '@gotipe/core/presets';

// Server-side: pre-render HTML
const { data: doc } = await useFetch('/api/document/doc-123');
const ssrHtml = import.meta.server
  ? await renderToHtml(doc.value!.content)
  : '';

// Client-side: interactive editor
const editor = import.meta.client
  ? useEditor({ extensions: DefaultPreset, content: doc.value!.content })
  : ref(null);
</script>

<template>
  <Editor v-if="editor" :editor="editor" />
  <div v-else class="gotipe-editor" v-html="ssrHtml" />
</template>
```

### Svelte (SvelteKit)

```svelte
<!-- routes/editor/+page.svelte -->
<script lang="ts">
  import { createEditor, Editor } from '@gotipe/svelte';
  import { DefaultPreset } from '@gotipe/core/presets';
  import { browser } from '$app/environment';

  const { data } = $props();

  const editor = browser
    ? createEditor({ extensions: DefaultPreset, content: data.doc.content })
    : null;
</script>

{#if editor?.isReady}
  <Editor {editor} />
{:else}
  <div class="gotipe-editor">{@html data.ssrHtml}</div>
{/if}
```

```typescript
// routes/editor/+page.server.ts
import { renderToHtml } from '@gotipe/core/server';

export async function load({ params }) {
  const doc = await db.getDocument(params.id);
  const ssrHtml = await renderToHtml(doc.content);
  return { doc, ssrHtml };
}
```

### Solid (SolidStart)

```tsx
// routes/editor.tsx
import { createEditor, Editor } from '@gotipe/solid';
import { DefaultPreset } from '@gotipe/core/presets';
import { Show, Suspense } from 'solid-js';
import { isServer } from 'solid-js/web';
import { createAsync } from '@solidjs/router';

export default function EditorPage() {
  const data = createAsync(() => fetchDocument('doc-123'));

  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Show when={data()}>
        {(doc) => {
          if (isServer) {
            return <div class="gotipe-editor" innerHTML={doc().ssrHtml} />;
          }

          const editor = createEditor({
            extensions: DefaultPreset,
            content: doc().content,
          });

          return (
            <Show when={editor.isReady} fallback={
              <div class="gotipe-editor" innerHTML={doc().ssrHtml} />
            }>
              <Editor editor={editor} />
            </Show>
          );
        }}
      </Show>
    </Suspense>
  );
}
```

### SSR API

```typescript
// packages/core/src/server.ts

/**
 * Renders a GoTipe document object to an HTML string. Does not read a string: the host
 * parses JSON (`JSON.parse`); a string is rejected with `TypeError` (D-185).
 * Works in Node.js through WASM, no browser required.
 */
export async function renderToHtml(
  content: object,
  options?: SSROptions,
): Promise<string>;

/**
 * Renders to Markdown.
 */
export async function renderToMarkdown(
  content: object,
): Promise<string>;

/**
 * Renders to plain text.
 */
export async function renderToText(
  content: object,
): Promise<string>;

export interface SSROptions {
  /** CSS class prefix */
  classPrefix?: string;
  /** Enable inline styles */
  inlineStyles?: boolean;
  /** Custom block renderers (HTML string) */
  blockRenderers?: Record<string, (block: BlockView) => string>;
}
```

---

## Adapter comparison

| Feature | React | Vue 3 | Svelte 5 | Solid | Vanilla JS |
|-------------|-------|-------|----------|-------|------------|
| Hook/Composable | `useEditor` | `useEditor` | `createEditor` | `createEditor` | `createEditor` |
| State selector | `useEditorState` | `useEditorState` | `$derived` | `createMemo` | `editor.on()` |
| Reactivity | `useSyncExternalStore` | `shallowRef` + `triggerRef` | Runes (`$state`) | Signals | Callbacks |
| Editor component | `<Editor>` | `<Editor>` | `<Editor>` | `<Editor>` | `editor.mount()` |
| BubbleMenu | `<BubbleMenu>` | `<BubbleMenu>` | `<BubbleMenu>` | `<BubbleMenu>` | `createBubbleMenu()` |
| FloatingMenu | `<FloatingMenu>` | `<FloatingMenu>` | `<FloatingMenu>` | `<FloatingMenu>` | `createFloatingMenu()` |
| Slots / Children | `children`, `slotBefore/After` | `#before`, `#after`, default | Snippets | `children` function | N/A |
| SSR | Next.js (RSC) | Nuxt 3 | SvelteKit | SolidStart | `renderToHtml()` |
| Server Components | React Server Components | N/A | N/A | N/A | N/A |
| Bundle size (adapter) | ~8KB | ~6KB | ~4KB | ~5KB | 0KB (core only) |

---

## Custom Block Rendering: all frameworks

Every adapter lets you override rendering of specific block types. This is the main UI customization mechanism. See [04-block-editor.md](04-block-editor.md) for the full catalog of block types.

### React

```tsx
<Editor
  editor={editor}
  blockRenderer={({ block, children }) => {
    if (block.type === 'codeBlock') {
      return (
        <div className="code-wrapper">
          <select
            value={block.attrs.language as string}
            onChange={(e) => editor.chain().setBlockAttrs(block.id, { language: e.target.value }).run()}
          >
            <option value="typescript">TypeScript</option>
            <option value="rust">Rust</option>
            <option value="python">Python</option>
          </select>
          <pre><code>{children}</code></pre>
        </div>
      );
    }
    return null; // default
  }}
/>
```

### Vue

```vue
<Editor :editor="editor">
  <template #block="{ block, children }">
    <div v-if="block.type === 'codeBlock'" class="code-wrapper">
      <select
        :value="block.attrs.language"
        @change="editor.chain().setBlockAttrs(block.id, { language: $event.target.value }).run()"
      >
        <option value="typescript">TypeScript</option>
        <option value="rust">Rust</option>
      </select>
      <pre><code><component :is="children" /></code></pre>
    </div>
  </template>
</Editor>
```

### Svelte

```svelte
<Editor {editor} blockRenderer={(block, children) => {
  if (block.type === 'codeBlock') {
    return {
      component: CodeBlockWrapper,
      props: { block, children },
    };
  }
  return null;
}} />
```

### Solid

```tsx
<Editor
  editor={editor}
  blockRenderer={(block, children) => {
    if (block.type === 'codeBlock') {
      return (
        <div class="code-wrapper">
          <select onChange={(e) => editor.instance?.chain().setBlockAttrs(block.id, { language: e.target.value }).run()}>
            <option value="typescript">TypeScript</option>
            <option value="rust">Rust</option>
          </select>
          <pre><code>{children()}</code></pre>
        </div>
      );
    }
    return children();
  }}
/>
```

---

## Extension UI Rendering

Extensions from [05-extensions.md](05-extensions.md) can define framework-specific UI through the `view` field. The core extension defines the logic, the adapter package defines the rendering.

```typescript
// packages/core/src/extensions/callout.ts (framework-agnostic)
export const Callout = defineExtension({
  name: 'callout',
  nodes: [{ name: 'callout', /* ... */ }],
  // ... input rules, slash commands
});

// packages/react/src/extensions/callout.tsx (React-specific rendering)
import { Callout as CalloutExtension } from '@gotipe/core/extensions';
import { defineBlockView } from '@gotipe/react';

export const CalloutView = defineBlockView({
  extension: CalloutExtension,
  component: ({ block, children }) => (
    <div className="gotipe-callout" data-emoji={block.attrs.emoji}>
      <EmojiPicker
        value={block.attrs.emoji as string}
        onChange={(emoji) => /* setBlockAttrs */}
      />
      <div className="gotipe-callout-content">{children}</div>
    </div>
  ),
});
```

---

## TypeScript Support

All adapters are fully typed. The ViewState, BlockView and GoTipeEditor types are exported from `@gotipe/core` and re-exported from each adapter package.

```typescript
import type {
  GoTipeEditor,
  ViewState,
  BlockView,
  TextSpanView,
  MarkView,
  SelectionView,
  ToolbarState,
  Extension,
} from '@gotipe/core';

// Or from the adapter:
import type { UseEditorOptions } from '@gotipe/react';
import type { EditorProps, BubbleMenuProps, FloatingMenuProps } from '@gotipe/react';
```

---

## Related documents

- [01-architecture.md](01-architecture.md) — rendering pipeline, ViewState generation, virtual rendering
- [04-block-editor.md](04-block-editor.md) — block types, slash commands, drag-and-drop, CSS variables
- [05-extensions.md](05-extensions.md) — extension presets, custom extensions, extension UI
- [09-sdk-and-api.md](09-sdk-and-api.md) — package APIs, bundle sizes, npm packages
