---
"@gotipe/react": minor
"@gotipe/svelte": minor
---

An editor that cannot be created now tells the app why, in React and Svelte.

- `@gotipe/react`: `useEditor` takes `onError(error)` and still returns `GoTipeEditor | null`.
  The new `useEditorStatus(options)` returns `{ editor, error }`; `useEditor` is its editor.
  `error` is `null` while the editor is created and once it exists, and an `Error` when
  creation failed (a rejection that is not an `Error` becomes one, with the reason as its
  `cause`). `onError` gets the same error once and is not passed to `createEditor`; without it
  the failure is logged as before. A creation that fails after unmount is no longer logged or
  reported, so Strict Mode reports one failure. When React runs the effect again (Fast
  Refresh, an `Activity` shown again), the hook starts from `{ editor: null, error: null }`
  and creates the editor from the current options: it no longer returns the destroyed editor
  of the cleaned-up effect, and the previous error is cleared. New type `EditorStatus`.
- `@gotipe/svelte`: `createEditorState` creates the editor only in the browser. In a server
  render the store stays empty and nothing is created, so a failure such as `PARSE_ERROR` for
  HTML content without a `DOMParser` no longer rejects unhandled on the server. In the browser a
  failed creation sets the store's `error`, which subscribers now receive with `editor` and
  `state`, and calls `onError(error)` once; without `onError` it is logged. A creation that
  fails after `destroy()` reports nothing. New types `CreateEditorStateOptions` and
  `EditorStoreValue`.
- `onError` reports only the creation. Errors of a working editor still go to `host.onError`
  and the `error` event.
