# @gotipe/svelte

The Svelte 5 adapter for GoTipe: a store that creates a GoTipe editor and follows its state.
It has no renderer component: you render the blocks and mount the editor on your element.

[Docs](https://gotipe.com/docs/frameworks/svelte-solid/) · [Website](https://gotipe.com) · [Repository](https://github.com/veniameen/gotipe)

## Install

```sh
npm install @gotipe/core @gotipe/svelte svelte
```

Svelte 5 or newer.

## Usage

```svelte
<script lang="ts">
  import { DefaultPreset } from "@gotipe/core/presets";
  import { createEditorState } from "@gotipe/svelte";
  import { onDestroy } from "svelte";

  const store = createEditorState({
    extensions: [DefaultPreset],
    engine: "js",
    onError: (error) => console.warn("The editor is unavailable:", error.message),
  });
  onDestroy(() => store.destroy());
</script>

{#if $store.error}
  <p role="alert">The editor could not start: {$store.error.message}</p>
{/if}
```

`createEditorState(options)` takes the options of `createEditor` from `@gotipe/core` and
`onError`. It creates the editor only in the browser and returns a store:

- `subscribe(fn)`: calls `fn({ editor, state, error })` at once and after every change; works
  with `$store`.
- `editor`: the `GoTipeEditor`, or `null` before it exists and after `destroy()`.
- `state`: the latest `ViewState` (blocks, selection, toolbar state).
- `error`: why the editor could not be created, or `null`.
- `destroy()`: destroys the editor.

To draw the document, render `state.blocks` with `data-block-id` and `data-block-type` and call
`editor.mount(element)`; the renderer contract and a full example are in the
[docs](https://gotipe.com/docs/frameworks/svelte-solid/#render-the-document-yourself).

## License

MIT. See [LICENSE](https://github.com/veniameen/gotipe/blob/main/packages/svelte/LICENSE).
