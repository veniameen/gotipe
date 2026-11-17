# AI provider and lifecycle

`@gotipe/ai` accepts an explicit `AiProvider`; without one, a command returns an error.
The demo uses a signed mock that sends no paid requests.
`AiContext.signal` cancels the network request/stream at the provider if it supports
AbortSignal. In any case, the manager discards a late result after cancel,
a provider change, the next command, a document change, read-only, or destroy.
An old request does not reset the status of a new one. Moving the caret does not change the target
of an edit that has already been requested.

The context is built from the document's public JSON, including nested/raw blocks and
a directional selection across blocks. The provider receives detached data.
`captureTarget()` saves the original document and selection. `applySuggestion`
applies the response to that selection in a single transaction; a stale document raises
an error. Generation/continue first collect the stream, then insert one block
next to the source. An error or cancellation never creates an empty or partially written block.
Low-level stream methods remain available to the host for its own preview.

Proofread checks block IDs, the source text, UTF-16 boundaries, and overlapping edits.
Accept All is one atomic transaction and one undo. After a single accept,
the remaining offsets shift relative to the accepted edit; an outside change to the
block makes the suggestion stale. Review comments check quotedText; these are
snapshot coordinates, so they are reset when the document changes. Durable shared
discussions belong to the separate `@gotipe/comments`.

`enablePiiDetection` is off by default. When enabled, the built-in detector
checks the context and prompt before calling the provider and blocks any email,
supported phone formats, and 16-digit Luhn cards it finds. This is a limited set of
patterns, not a full personal-data classifier. Nothing is edited
silently: replacing text in a review context would break offsets. `detectPii` returns
UTF-16 start/end; shared tests compare the result with the built WASM detector.

The AI UI shows loading/error/retry/cancel, prevents repeat submits,
and respects read-only/destroy. Tab for ghost text and ⌘J (Ctrl+J; the physical J key on
any layout) for the command bar belong to a specific editor surface; ⌘K is the
link shortcut (`openLinkDialog`). The block editor's AI elements are Improve, the ⌘J row,
ghost text, and the status line. They are shown only when the `@gotipe/ai` extension
backs them (`block-editor/src/components/ai-controls.ts`); without it they do not exist, and ⌘J
stays with the browser. Autocomplete appears only at the end of a text
block while the editor has focus; the overlay is clipped within the available row and follows
scroll/resize. Commands and listeners are released by the extension's owner.

Checks: `packages/ai/src/manager.test.ts`, `packages/ai/tests/pii.test.ts`,
`packages/ai-ui/src/command-palette.test.tsx`,
`packages/block-editor/src/components/ai-command-bar.test.tsx`, the existing
`e2e/ai-features.spec.ts` with a real editor and a mock provider, including 320px, and
`e2e/ai-availability.spec.ts`, which verifies that AI elements are present only with the extension.
