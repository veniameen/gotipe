---
title: Offline and conflicts
description: What happens to edits while the connection is down, how to keep them across reloads, and how the editor reports a remote change that interrupts IME input.
packages: ["@gotipe/collaboration", "@gotipe/core"]
license: MIT
---

A replica does not need the server to edit. Every change goes into its CRDT log first, and
the provider sends it when it can. This page covers the time in between, and the one
conflict GoTipe hands back to you instead of merging it.

## While offline

- Edits apply at once. The WASM replica keeps their operations in memory.
- `onSyncChange` reports `pendingOperations`, the operations the server has not confirmed,
  after every local edit. `saving` is `true` while an update waits for its ACK.
- Remote carets disappear: `onPeersChange` receives an empty list.
- The provider reconnects with growing delays. It merges the server's state first, then
  sends only the operations the server does not have. Edits made on both sides converge.
- After `maxReconnectAttempts` the provider reports `error` and stops trying. The edits
  stay in the editor. Call `connect(editor)` to resume, for example on the browser's
  `online` event; while the provider is still trying, `connect` does nothing.

```ts title="sync-status.ts"
import { CollaborationProvider, type CollaborationState } from "@gotipe/collaboration";
import type { GoTipeEditor } from "@gotipe/core";

export function connectWithStatus(
  editor: GoTipeEditor,
  initialState: CollaborationState,
  getToken: () => Promise<string>,
  status: HTMLElement,
): () => void {
  const provider = new CollaborationProvider({
    documentId: "doc-123",
    wsUrl: "wss://sync.example.com/sync",
    initialState,
    token: getToken,
    user: { name: "Alice", color: "#3264ab" },
    onSyncChange: ({ pendingOperations, saving }) => {
      status.textContent =
        pendingOperations === 0 ? "Saved" : saving ? "Saving…" : "Not saved yet";
    },
  });
  provider.connect(editor);
  const resume = () => provider.connect(editor);
  window.addEventListener("online", resume);
  return () => {
    window.removeEventListener("online", resume);
    provider.destroy();
  };
}
```

## Keep edits across reloads

The provider keeps unconfirmed operations in memory only. It does not write to IndexedDB or
any other storage, so edits the server has not confirmed are lost when the tab closes,
unless your app saved them. Save the baseline you loaded together with the replica's
update log:

```ts title="local-copy.ts"
import type { CollaborationState } from "@gotipe/collaboration";
import type { GoTipeEditor } from "@gotipe/core";

const decoder = new TextDecoder();

export function keepLocalCopy(editor: GoTipeEditor, key: string, baseline: object): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = () => {
    const state: CollaborationState = {
      baseline,
      updates: [decoder.decode(editor.getCollaborationUpdate())],
    };
    localStorage.setItem(key, JSON.stringify(state));
  };
  const stop = editor.on("update", () => {
    clearTimeout(timer);
    timer = setTimeout(save, 500);
  });
  return () => {
    clearTimeout(timer);
    stop();
  };
}

export function readLocalCopy(key: string): CollaborationState | null {
  const saved = localStorage.getItem(key);
  return saved ? (JSON.parse(saved) as CollaborationState) : null;
}
```

On the next start, prefer the local copy. The provider replays it and then merges whatever
the server has:

```ts title="start.ts"
import { CollaborationProvider, type CollaborationState } from "@gotipe/collaboration";
import { createEditor } from "@gotipe/core";
import { FullPreset } from "@gotipe/core/presets";
import { keepLocalCopy, readLocalCopy } from "./local-copy";

const documentId = "doc-123";
const key = `gotipe:${documentId}`;
const getToken = async () => (await fetch("/api/gotipe-token")).text();

async function loadFromCloud(): Promise<CollaborationState> {
  const response = await fetch(`https://api.example.com/v1/documents/${documentId}`, {
    headers: { Authorization: `Bearer ${await getToken()}` },
  });
  if (!response.ok) throw new Error(`Document load failed: ${response.status}`);
  return (await response.json()).collaboration_state;
}

const initialState = readLocalCopy(key) ?? (await loadFromCloud());
const editor = await createEditor({
  engine: "wasm",
  content: initialState.baseline,
  extensions: [FullPreset],
});
const provider = new CollaborationProvider({
  documentId,
  wsUrl: "wss://sync.example.com/sync",
  initialState,
  token: getToken,
  user: { name: "Alice", color: "#3264ab" },
});
provider.connect(editor);
keepLocalCopy(editor, key, initialState.baseline);
editor.mount(document.querySelector<HTMLElement>("#editor")!);
```

Rules for the stored copy:

- Store the baseline you got from the server, not `editor.getJSON()`. Rendered content has
  no CRDT identities and is not a baseline.
- Let every editor get a new `peerId` (the default). Restored operations keep the IDs they
  were made with; reusing an old peer ID can create IDs that the server already holds with
  different content.
- The log only grows: it holds every operation since the baseline. Prefer IndexedDB to
  `localStorage` for large documents.
- If the server's baseline changed, because the document was replaced over REST or a
  version was restored, the stored operations no longer apply. The provider stops at the
  handshake and calls `onBaselineReplaced`; drop the local copy and load the document again
  (see [When the document is replaced](/docs/collaboration/provider#when-the-document-is-replaced)).

Without a provider, `applyCollaborationState(editor, state, peerId)` performs the same
replay for a transport of your own.

## Conflicts during IME input

An input method for Chinese, Japanese, Korean and many other languages keeps the text it
composes outside the document until the composition ends. When a remote update arrives in
the middle of a composition, the editor ends the composition before it changes the
document, so the model and the screen stay consistent.

The composed text is not inserted, and GoTipe does not rebase overlapping edits. It hands
the text back to you instead:

- The editor emits `error` and calls `host.onError` with a `GoTipeError` of code
  `COMPOSITION_CONFLICT`. It also emits `compositionInterrupted`.
- `error.details.text` is the interrupted text and `error.details.selection` the selection
  it was meant for. `error.details.reason` is `receiveCollaborationUpdate` for a remote
  edit, or `dispatch`, `undo`, `redo` or `setContent` when your code changed the document.
- If the person keeps typing into the interrupted composition, the error repeats with the
  longer text. Keep the latest one.

```ts title="composition-recovery.ts"
import type { GoTipeEditor } from "@gotipe/core";

export function offerLostInput(editor: GoTipeEditor, show: (text: string) => void): () => void {
  return editor.on("error", (error) => {
    if (error.code !== "COMPOSITION_CONFLICT") return;
    const text = error.details?.text;
    if (typeof text === "string" && text) show(text);
  });
}
```

Show the text with a way to copy it or insert it again. The error toast of `BlockEditor`
does not show this error. Remote carets never interrupt a composition; they update when it
ends.

## Limitations

- Unconfirmed edits live in memory. Keeping them across reloads is your app's job.
- An interrupted composition is not merged automatically.
- The client never compacts its log, and every update carries the whole log.

## Related

- [Collaboration provider](/docs/collaboration/provider): reconnect and ACK rules.
- [Collaboration](/docs/collaboration/overview): baselines and what is shared.
- [Events](/docs/concepts/events) and [Host integration](/docs/concepts/host): `error` and
  `host.onError`.
