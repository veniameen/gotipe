# @gotipe/solid

The Solid adapter for GoTipe: hooks that create a GoTipe editor and follow its state. It has no
renderer component: you render the blocks and mount the editor on your element.

[Docs](https://gotipe.com/docs/frameworks/svelte-solid/) · [Website](https://gotipe.com) · [Repository](https://github.com/veniameen/gotipe)

## Install

```sh
npm install @gotipe/core @gotipe/solid solid-js
```

Solid 1.8 or newer.

## Usage

```tsx
import { DefaultPreset } from "@gotipe/core/presets";
import { useEditorStatus } from "@gotipe/solid";
import { Show } from "solid-js";

export function EditorError() {
  const { editor, error } = useEditorStatus({ extensions: [DefaultPreset], engine: "js" });
  return (
    <Show when={error()} fallback={<p>{editor() ? "Ready" : "Loading…"}</p>}>
      {(failure) => <p role="alert">The editor could not start: {failure().message}</p>}
    </Show>
  );
}
```

- `useEditor(options)`: an `Accessor<GoTipeEditor | null>`; the editor is created in `onMount`
  and destroyed in `onCleanup`.
- `useEditorStatus(options)`: `{ editor, error }`, two accessors: the same editor and why it
  could not be created.
- `useEditorState(editor, selector)`: an accessor with `selector(viewState)`, updated on every
  view change, for example `useEditorState(editor, (state) => state.toolbar.activeMarks)`.

`useEditor` and `useEditorStatus` take the options of `createEditor` from `@gotipe/core` and
`onError`. To draw the document, render `viewState.blocks` with `data-block-id` and
`data-block-type` and call `editor.mount(element)`; the renderer contract and a full example
are in the [docs](https://gotipe.com/docs/frameworks/svelte-solid/#render-the-document-yourself).

## License

MIT. See [LICENSE](https://github.com/veniameen/gotipe/blob/main/packages/solid/LICENSE).
