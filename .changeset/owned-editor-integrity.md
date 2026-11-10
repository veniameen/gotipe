---
"@gotipe/core": minor
"@gotipe/react": minor
"@gotipe/markdown": minor
"@gotipe/comments": minor
"@gotipe/suggestions": minor
"@gotipe/versions": minor
"@gotipe/block-editor": minor
"@gotipe/theme": minor
---

Implement atomic editor validation, Unicode-safe selection and undo, configured extension/plugin and paste lifecycles, and a transport-free native collaboration port. Add typed document snapshots, transaction filters/previews, staged command selections and mounted element ownership. Validate collapsed marks against the configured node schema and place nested insertions using custom parent childTypes.

Replace third-party Markdown parsing with the owned grammar and preserve nested/raw content and supported formatting across JS/WASM exports. Add TextColor and colored highlight serialization with inert CSS color validation.

Provide persistent comment anchors/replies and suggestion inverse snapshots, actual tracked editing and atomic review actions. Replace placeholder version/comment/review examples with functional PageEditor interfaces, responsive discussion styles and explicit host persistence boundaries.

Complete touch/pen block dragging in both editor interfaces with shared long-press,
row movement, edge scrolling, cancellation and one-step undo. Track PageEditor handle
position when its container resizes and preserve short-tap menu behavior.

Keep block handles aligned to editable text when a block has leading controls, and
bound the slash menu by both its compact height and the available viewport.

Expose the DOM-free `serializeHtml` document serializer and honor `classPrefix`/`inlineStyles` in server rendering, including custom block renderers.

Restore renderer-owned DOM identities before committing native composition, including
forward/reverse selections spanning blocks. Keep raw-code composition after a trailing
newline and preserve Unicode caret positions and undo boundaries in Firefox.

Render nested todo children in both editor views and keep child selection within its own row.
Make toolbar block insertion and its slash trigger one undoable transaction.

Expose side-effect-free `getDOMSelection()` for renderer caret snapshots without invalidating
external-store state or transferring document ownership to a UI adapter.

Honor Shift+Enter soft-break intent when WebKit reports an insertParagraph input event,
preserving block type, marks, Unicode caret positions and one-step Undo.

Interrupt native IME before concurrent document/history/collaboration changes can invalidate
renderer-owned nodes. Report recoverable `COMPOSITION_CONFLICT` text/selection/reason to the
host and suppress late native commits against the changed document. Defer presentation-only
decoration layers until IME reconciliation so awareness does not interrupt typing. Cancel deferred token
frames when another composition starts. Expose the `compositionInterrupted` lifecycle event
for adapters to resume presentation without consuming the application error channel.
