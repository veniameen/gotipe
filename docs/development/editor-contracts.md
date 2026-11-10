# Editor and review contracts

## Document boundary

`editor.getJSON()` returns the canonical `Document`: nested blocks with stable IDs,
JSON attributes, rich text spans, raw text strings or `null` empty content. Attribute
values may contain finite JSON arrays/objects. Offsets are UTF-16 code units, and a
selection/edit cannot split a surrogate pair.

`editor.validate(documentOrJsonString)` returns a boolean. With configured nodes and
marks, creation, replacement and transaction results must satisfy that schema. A
schema-free editor (`extensions: []`) still validates document shape, IDs and JSON.
Custom attributes must be declared by an extension; undeclared values are rejected,
not removed. Legacy empty text content (`null`) becomes typed content on first edit.
Each staged mark operation checks the current target node and mark attributes, even
for a collapsed range that only changes stored marks. A command that inserts an ordinary
or compound block beside a nested selection climbs past parents whose configured
`childTypes` reject that block; allowed siblings remain inside their parent.


`dispatch(transaction)` commits the entire valid transaction and its optional selection
or throws without committing. It returns `false` when a registered transaction filter
cancels the operation. `addTransactionFilter(context => boolean)` returns an unsubscribe
function; contexts contain detached `before`, `after` and `transaction` values. Filters
cannot dispatch recursively. The `transaction` event is emitted after a local dispatch
commits and before `update`. Observer failures are reported through `error`/`host.onError`
and do not convert a committed edit into a reported rejection.

`previewTransaction(transaction)` validates and projects a change without changing
content, selection, history or subscriptions. `chain().setSelection(selection)` stages
a directional or cross-block selection for the next command without first moving the
live caret. `editor.element` identifies the mounted DOM owner or is `null` headlessly.
`editor.getDOMSelection()` reads a detached directional UTF-16 selection through the
mounted core DOM mapper. It does not update model selection, invalidate the view snapshot,
emit events, focus or move the native caret. It returns `null` without a mounted owned
range (including independent widgets) or after unmount/destroy. Render adapters can
capture it before replacing presentation-only text nodes; `syncSelectionFromDOM()` remains
the explicit operation that copies native selection into the model.
Native IME temporarily owns its DOM text. Before committing, the composition owner
restores the original renderer-owned nodes and applies one transaction; native removal
of an empty BR or a selected sibling cannot invalidate the adapter's DOM references.
Forward and reverse cross-block compositions replace the captured selection while
retaining surrounding text and block identities. Raw code ending in a newline renders
a trailing BR so browser composition can target its final empty line.
An accepted external document mutation during native IME interrupts that composition
**before** changing the model or publishing a renderer update. This applies to dispatch,
setContent, Undo/Redo and received collaboration updates; changing editability also ends
native ownership. Presentation-only decoration updates are deferred during composition
(latest value per layer) and published after native DOM reconciliation. They do not
interrupt IME for cursor awareness; unmount/destroy discards pending presentation work. The core restores the renderer's original node identities while they
still belong to the current document. It then applies the requested change and reports
`COMPOSITION_CONFLICT` through `error` / `host.onError`, with recoverable
`details.text`, the original directional `details.selection` and `details.reason`.
Adapters can release presentation work on `compositionInterrupted`; this lifecycle signal
does not consume the public error event or suppress the host's default error reporting.
The interrupted text is not inserted automatically into a possibly removed or changed
range. Hosts must offer recovery from those details; this is an explicit conflict contract,
not seamless concurrent IME rebasing. A changed late native final payload is reported again;
an empty cancellation does not erase the captured recovery text. Late native input from
the interrupted session cannot mutate the current document or history. A fresh key,
pointer action or compositionstart releases that suppression. Invalid/filtered/no-op
dispatches and unavailable Undo/Redo do not interrupt composition. Collaboration receives
conservatively interrupt before the opaque native CRDT operation, including duplicate updates.
Shift+Enter inserts a soft LF in the same block, preserving marks and one-step Undo,
even when the browser reports `beforeinput.insertParagraph` instead of `insertLineBreak`.
The remembered key intent is consumed by that input event and does not affect the next Enter.

Independent captions/inputs/widgets do not belong to the main editing surface. A custom
block with leading controls can declare its editable text host with
`data-gotipe-text-content`; caret restoration then targets that host even when empty.

## Extensions and paste

Duplicate extension names use the last supplied configuration; dependencies initialize
first. Plugin factories receive configured options once. `init(state)` runs after the
initial document/selection exists; `apply(transaction, state)` receives committed local
transactions; `decorations(state)` refreshes after document/selection changes, including
undo, replacement and remote updates. `destroy()` releases plugin resources. Extension
`onCreate`, `onUpdate` and `onDestroy` run through the same owner. Cleanup runs in reverse
order, including a partially failed creation. Plugin callback failures are reported.

Paste rules match plain clipboard text or a file MIME type. The first matching rule
owns the entry. Its existing `handler(editor, data, options)` receives an isolated JS
draft with the same schema and host; plugin factories and extension lifecycle callbacks
do not run again. Multiple handler commands and multiple files commit together as one
undoable change. Errors discard that draft; matched rules never silently fall back to
ordinary insertion. A later document/selection change, unmount, destruction or newer
paste prevents a stale result from committing. Internal GoTipe clipboard payloads keep
their structured format instead of running text rules.

`Image.configure({ maxSize, allowedTypes, upload })` is enforced for paste/drop images.
Configured upload takes precedence for that rule; otherwise `host.saveAsset` or the
bounded durable inline asset fallback is used. Raster media limits still apply.
External storage cleanup belongs to the host: a cancelled document insertion cannot
undo an already completed upload. See [asset contract](assets.md).

## Comments and suggestions

`CommentsManager` owns comment/reply CRUD, resolve/reopen, quotes, anchors and its
independent decoration layer. `subscribe()` and `onChange(snapshot)` let a host render
and persist records. `exportState()` / `loadState(unknown)` use a validated versioned
snapshot and preserve author/date/reply metadata. Loading invalid records does not
partially replace existing state. Anchors follow unchanged quoted text across edits
and block IDs; missing or ambiguous text is marked `orphaned` and is not guessed.
`reanchorComment(id, range)` attaches an orphan to a new explicit quote. Comment metadata
is independent of document editability; a host controls which UI action callbacks exist.
The playground persists document Markdown and discussion in its browser tab's session
storage. This is not server persistence or automatic collaboration of comments.

`SuggestionsManager.enable()` tracks visible draft transactions. Accept finalizes an
already visible change; Reject applies a validated inverse. Explicit `addSuggestion`
proposals remain unapplied until accepted. Stale/ambiguous changes fail without changing
the draft. Reject-all plans and validates one atomic inverse transaction. Undo of a
rejection restores both the text and its pending review status. Persist `exportState()`
with the document, not just `getSuggestions()`: the versioned snapshot includes anchors
and before/after content required for rejection after reload. `loadState(unknown)`
validates all records before replacing state. Destroying either manager removes its
subscriptions and decoration layer. Review records require a host's own network protocol
if they must synchronize between users.

## Collaboration and versions

`enableCollaboration(peerId)`, `getCollaborationUpdate()` and
`receiveCollaborationUpdate(bytes)` form a transport-free native collaboration port.
The JS-only entry explicitly reports collaboration unavailable. Native selective undo
keeps remote edits; identity-based selection bookmarks track concurrent insertions.
The WebSocket provider owns connection/reconnect/ACK; a host owns bootstrap and durable
storage. A connection never replaces a document with a guessed baseline.

The versions manager captures detached document snapshots, computes text/attribute/order
changes, previews an immutable snapshot and restores through the editor's undo boundary.
Automatic snapshots occur only for changed content; destroy stops its timer. The
playground keeps versions in memory for the current session, and shows that limitation.

## Formatting and serialization

The own Markdown parser and serializer run without DOM or third-party runtime parsers.
Both core engines use this serializer for the browser-facing `getMarkdown()`. Untouched
Markdown sessions retain their original bytes; edited blocks use canonical syntax.
`TextColor` and colored `Highlight` preserve allowed CSS colors using owned inline HTML
forms. `toSafeColor` accepts inert color tokens and rejects declarations, URLs and CSS
variables; serializers escape text and validate links separately. Framework adapters
must apply the same boundaries to untrusted mark attributes.

## Block handles and touch

Both editor interfaces use the same row hit testing and atomic move transaction.
Touching content reveals its handle. Holding the handle for 300 ms starts a touch/pen
drag; movement before activation cancels it. The insertion indicator follows the
pointer and edge scrolling. Releasing inside the editor commits one undoable move;
pointer cancellation, Escape, blur, read-only changes, destruction or unmount cancel
without writing. A short tap opens the handle menu. The compatibility click after an
active drag is suppressed briefly so it cannot accidentally open that menu.

Mouse dragging keeps native drag feedback; Alt-drag moves a whole list instead of its
row. The PageEditor handle measures content and container resize as well as viewport
resize/scroll, so an embedded panel does not need a window resize event to reposition it.

Todo rows render their child blocks in both standard and Page views; clicking a child
row must not move the caret into its parent. Toolbar insertion, its optional slash
trigger and the target caret form one transaction and one Undo step.

## Optional code highlighting

The document stores raw code and its language independently of highlighting.
`PageEditor.highlight` and `CodeBlockView.highlight` accept a `CodeHighlighter`:
`(code, language) => Promise<HighlightToken[][] | null>`. Each array represents
one line; joining token content with `\n` must reproduce the code exactly.
`null` means an unsupported language. Failed, stale or text-changing results keep
raw code visible. Highlighting does not change the document or create undo entries.

The base editor imports no grammar engine. An optional Shiki adapter is available
through the separate `@gotipe/block-editor/shiki` entry. The host installs its
compatible Shiki peer and explicitly chooses lazy language/theme imports:

```tsx
import { PageEditor } from '@gotipe/block-editor';
import { createShikiHighlighter } from '@gotipe/block-editor/shiki';
import '@gotipe/theme/page.css';

const highlight = createShikiHighlighter({
  langs: { javascript: () => import('shiki/langs/javascript.mjs') },
  aliases: { js: 'javascript' },
  themes: {
    light: () => import('shiki/themes/github-light.mjs'),
    dark: () => import('shiki/themes/github-dark.mjs'),
  },
});

export function CodePage({ markdown }: { markdown: string }) {
  return <PageEditor markdown={markdown} highlight={highlight} />;
}
```

The adapter initializes on its first supported request and retries a failed grammar
load on a later request. It uses the JavaScript regex engine, without an additional
WASM binary or eval. The host must serve its generated chunks under its CSP. Token
text renders as React text nodes and colors pass the shared CSS color validator;
light/dark, italic, bold and underline styles belong to the shared code theme.
A host may supply its own highlighter through the same contract.
