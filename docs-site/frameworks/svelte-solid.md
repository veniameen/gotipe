---
title: Svelte and Solid
description: The Svelte store and the Solid hooks that create and observe a GoTipe editor, and the contract for rendering the document yourself.
packages: ["@gotipe/svelte", "@gotipe/solid"]
license: MIT
---

`@gotipe/svelte` and `@gotipe/solid` own the editor's lifecycle and give you its state.
They have no renderer component: you render the blocks and mount the editor on your
element. Commands, events, Markdown and export are the same core API as everywhere else.

## Install

```sh tab="Svelte"
npm install @gotipe/core @gotipe/svelte svelte
```

```sh tab="Solid"
npm install @gotipe/core @gotipe/solid solid-js
```

Svelte 5 or newer; Solid 1.8 or newer.

## API

Svelte has one function, `createEditorState(options)`, with the `createEditor` options. It
returns a store:

| Member | Description |
|---|---|
| `subscribe(fn)` | Calls `fn({ editor, state })` at once and after every view change; returns an unsubscribe function. Works with `$store`. |
| `editor` | The `GoTipeEditor`, or `null` before it exists and after `destroy()`. |
| `state` | The latest `ViewState`, or `undefined`. |
| `destroy()` | Destroys the editor and tells subscribers `{ editor: null, state: undefined }`. |

The editor is created as soon as you call `createEditorState`, so call it in `onMount` and
destroy the store in its cleanup. An editor that resolves after `destroy()` is destroyed.

Solid has two hooks:

| Hook | Returns | Description |
|---|---|---|
| `useEditor(options)` | `Accessor<GoTipeEditor \| null>` | Creates the editor in `onMount` and destroys it in `onCleanup`. |
| `useEditorState(editor, selector)` | `Accessor<T \| undefined>` | `selector(viewState)`, updated on every view change. |

## Render the document yourself

The core draws nothing. It handles input on one element and maps the browser's selection
to the document through attributes. A renderer does this:

1. Render `viewState.blocks` inside one element, call `editor.mount(element)` once it
   exists and `editor.unmount()` before it goes away. `mount` sets `contenteditable`
   itself, so do not bind that attribute.
2. Give every block element `data-block-id` and `data-block-type`. Render list items
   (`listItem`, `todoItem`) as direct children of their list element, and a task's text
   inside an element with `data-gotipe-todo-content`.
3. Inside a block element, render the block's text as text nodes and inline elements for
   marks, then its child blocks. Give buttons and other parts that are not text
   `data-gotipe-widget` and `contenteditable="false"`; if controls come before the text,
   wrap the text in an element with `data-gotipe-text-content`.
4. Render an empty block with `<br data-gotipe-trailing-break>` so the caret can enter it.
5. Re-render on each view change and keep a block's element while its id stays the same.
   When `block.renderKey` is set and changes, rebuild that block's element.

Typing goes through the model: the core cancels the browser's change, applies a
transaction and puts the caret back after your renderer has updated.

Both sketches below render paragraphs with bold and italic, the schema of `MinimalPreset`:

```svelte title="Notes.svelte" tab="Svelte"
<script lang="ts">
  import type { BlockView, GoTipeEditor } from "@gotipe/core";
  import { MinimalPreset } from "@gotipe/core/presets";
  import { createEditorState } from "@gotipe/svelte";
  import { onMount } from "svelte";

  let surface: HTMLDivElement;
  let editor = $state.raw<GoTipeEditor | null>(null);
  let blocks = $state.raw<BlockView[]>([]);

  onMount(() => {
    const store = createEditorState({ extensions: [MinimalPreset], content: "<p>Hello from <strong>Svelte</strong>.</p>" });
    const unsubscribe = store.subscribe((value) => {
      editor = value.editor;
      blocks = value.state?.blocks ?? [];
    });
    return () => {
      unsubscribe();
      store.destroy();
    };
  });

  $effect(() => {
    const current = editor;
    if (!current) return;
    current.mount(surface);
    return () => current.unmount();
  });

  const spans = (block: BlockView) => (Array.isArray(block.content) ? block.content.filter((span) => span.text) : []);
  const has = (marks: { type: string }[], type: string) => marks.some((mark) => mark.type === type);
</script>

<div bind:this={surface} class="notes" role="textbox" aria-multiline="true" aria-label="Notes">
  {#each blocks as block (block.renderKey ? `${block.id}:${block.renderKey}` : block.id)}
    <p data-block-id={block.id} data-block-type={block.type}>
      {#each spans(block) as span}
        <span class:bold={has(span.marks, "bold")} class:italic={has(span.marks, "italic")}>{span.text}</span>
      {:else}
        <br data-gotipe-trailing-break />
      {/each}
    </p>
  {/each}
</div>
```

```tsx title="Notes.tsx" tab="Solid"
import type { BlockView } from "@gotipe/core";
import { MinimalPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/solid";
import { For, createEffect, onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

type Row = BlockView & { key: string };
// one element per id, rebuilt when the core changes the block's renderKey
const rows = (blocks: BlockView[]): Row[] =>
  blocks.map((block) => ({ ...block, key: block.renderKey ? `${block.id}:${block.renderKey}` : block.id }));
const spans = (block: BlockView) => (Array.isArray(block.content) ? block.content.filter((span) => span.text) : []);
const has = (marks: { type: string }[], type: string) => marks.some((mark) => mark.type === type);

export function Notes() {
  const editor = useEditor({ extensions: [MinimalPreset], content: "<p>Hello from <strong>Solid</strong>.</p>" });
  const [doc, setDoc] = createStore({ blocks: [] as Row[] });
  let surface!: HTMLDivElement;

  createEffect(() => {
    const current = editor();
    if (!current) return;
    const sync = () => setDoc("blocks", reconcile(rows(current.getViewState().blocks), { key: "key" }));
    sync();
    const off = current.on("viewStateChange", sync);
    current.mount(surface);
    onCleanup(() => {
      off();
      current.unmount();
    });
  });

  return (
    <div ref={surface} class="notes" role="textbox" aria-multiline="true" aria-label="Notes">
      <For each={doc.blocks}>
        {(block) => (
          <p data-block-id={block.id} data-block-type={block.type}>
            <For each={spans(block)} fallback={<br data-gotipe-trailing-break />}>
              {(span) => (
                <span classList={{ bold: has(span.marks, "bold"), italic: has(span.marks, "italic") }}>{span.text}</span>
              )}
            </For>
          </p>
        )}
      </For>
    </div>
  );
}
```

Style the `.bold` and `.italic` classes in your CSS. In Solid, use `useEditorState` for
toolbar state, for example `useEditorState(editor, (state) => state.toolbar.activeMarks)`.

For a view that never edits, skip the renderer: `editor.getHTML()` returns the document as
HTML built from its structure, with text escaped and links checked.

## Limitations

- GoTipe tests these adapters' lifecycle and subscriptions, not a renderer for Svelte or
  Solid. Check typing, IME, undo, selection and paste in yours.
- Placeholders, review highlights, remote cursors, table controls, media UI and menus
  come with the React renderer only. With Svelte or Solid you build them from
  `block.decorations` and the core commands, or use
  [the framework-free menus](/docs/ui/menus#menus-without-a-framework).

## Related

- [React](/docs/frameworks/react) · [Vue](/docs/frameworks/vue) · [Commands](/docs/concepts/commands)
- [Document model](/docs/concepts/document-model) · [Events](/docs/concepts/events)
