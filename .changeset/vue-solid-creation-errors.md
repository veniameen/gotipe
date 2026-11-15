---
"@gotipe/vue": minor
"@gotipe/solid": minor
---

An editor that cannot be created now tells the app why in Vue and Solid too, as in React and
Svelte.

- `useEditor` takes `onError(error)` and still returns the editor ref (Vue) or accessor
  (Solid). The new `useEditorStatus(options)` returns `{ editor, error }` — two `ShallowRef`s
  in Vue, two accessors in Solid; `useEditor` is its editor. New type `EditorStatus`.
- `error` is `null` until creation fails, then an `Error` (a rejection that is not an `Error`
  becomes one, with the reason as its `cause`). `onError` gets the same error once and is not
  passed to `createEditor`; without it the failure is logged to the console. A creation that
  fails after unmount reports nothing.
- `@gotipe/solid`: a failed creation no longer rejects unhandled. `@gotipe/vue`: it no longer
  goes to Vue's error handling, where a development build without a handler rethrew it as an
  unhandled rejection.
- `onError` reports only the creation. Errors of a working editor still go to `host.onError`
  and the `error` event.
