# @gotipe/collaboration

Real-time collaboration for the GoTipe editor. Each editor holds a replica of GoTipe's own
CRDT (Rust compiled to WebAssembly); `CollaborationProvider` carries its operations to a
GoTipe Cloud sync server over a WebSocket and shows who else is in the document. GoTipe
Cloud is a backend you run yourself.

[Docs](https://gotipe.com/docs/collaboration/overview/) · [Website](https://gotipe.com) · [Repository](https://github.com/veniameen/gotipe)

## Install

```sh
npm install @gotipe/collaboration @gotipe/core @gotipe/wasm
```

`@gotipe/wasm` is an optional peer of `@gotipe/core`, but collaboration needs it: create the
editor with `engine: "wasm"`. The JS engine has no CRDT.

## Usage

```ts
import { type CollaborationState, CollaborationProvider } from "@gotipe/collaboration";
import { createEditor } from "@gotipe/core";
import { FullPreset } from "@gotipe/core/presets";

// From GET /v1/documents/{id} of your GoTipe Cloud: { baseline, updates, generation }.
declare const initialState: CollaborationState;
declare const getToken: () => Promise<string>;

const editor = await createEditor({
  engine: "wasm",
  content: initialState.baseline,
  extensions: [FullPreset],
});
const provider = new CollaborationProvider({
  documentId: "doc-123",
  wsUrl: "wss://sync.example.com/sync",
  initialState,
  token: getToken,
  user: { name: "Alice", color: "#3264ab" },
  onError: (error) => console.warn(error.message),
});
provider.connect(editor); // replays the stored updates; connect before mounting
editor.mount(document.querySelector<HTMLElement>("#editor")!);

// When the view closes:
// provider.destroy(); editor.destroy();
```

- `CollaborationProvider` owns the WebSocket, the handshake, saving with acknowledgements,
  reconnects and awareness (names, colors, carets).
- `defineCollaboration` creates and connects a provider with the editor;
  `getCollaborationProvider(editor)` returns it.
- `LocalCollaborationBridge` syncs editors on one page without a server, for demos and tests.
- `applyCollaborationState(editor, state, peerId)` replays stored state for a transport of
  your own.

Comments, suggestions, versions and undo history are not part of the replicated document.
See [Collaboration provider](https://gotipe.com/docs/collaboration/provider/) and
[Offline and conflicts](https://gotipe.com/docs/collaboration/offline/).

## License

MIT — see [LICENSE](https://github.com/veniameen/gotipe/blob/main/packages/collaboration/LICENSE).
