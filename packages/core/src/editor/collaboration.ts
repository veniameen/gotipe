import { engineToViewSelection, viewToEngineSelection } from "../document/selection";
import { GoTipeError } from "../error";
import type { SelectionView } from "../types/view";
import type { WasmBridge } from "../wasm-bridge";

interface CollaborationPort {
  readonly destroyed: boolean;
  selection: SelectionView;
  resetHistory(): void;
  changed(): void;
  beforeMutation(reason: string): void;
}

function orderedJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(orderedJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${orderedJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Transport-free collaboration lifecycle; callers own sockets and rebroadcast suppression. */
export function createCollaboration(
  bridge: Pick<
    WasmBridge,
    | "engine"
    | "getState"
    | "enableCollaboration"
    | "getUpdate"
    | "receiveUpdate"
    | "getSelection"
    | "setSelection"
  >,
  port: CollaborationPort,
) {
  let peer: string | null = null;
  const assertAvailable = () => {
    if (port.destroyed) throw new GoTipeError("EDITOR_NOT_INITIALIZED", "Editor was destroyed");
    if (bridge.engine !== "wasm")
      throw new GoTipeError("COLLABORATION_UNAVAILABLE", "Collaboration requires the WASM engine");
  };
  const assertEnabled = () => {
    assertAvailable();
    if (!peer)
      throw new GoTipeError(
        "COLLABORATION_ERROR",
        "Enable collaboration before exchanging updates",
      );
  };
  return {
    enable(peerId: string): void {
      assertAvailable();
      if (!peerId.trim())
        throw new GoTipeError("COLLABORATION_ERROR", "A non-empty peer ID is required");
      if (peer === peerId) return;
      if (peer)
        throw new GoTipeError(
          "COLLABORATION_ERROR",
          "An active collaboration peer ID cannot change",
        );
      bridge.enableCollaboration(peerId);
      peer = peerId;
      port.resetHistory();
    },
    getUpdate(): Uint8Array {
      assertEnabled();
      return bridge.getUpdate().slice();
    },
    receiveUpdate(update: Uint8Array): void {
      assertEnabled();
      port.beforeMutation("receiveCollaborationUpdate");
      const before = JSON.parse(bridge.getState());
      if (port.selection.anchor.blockId)
        bridge.setSelection(JSON.stringify(viewToEngineSelection(port.selection)));
      const next = JSON.parse(bridge.receiveUpdate(update));
      if (orderedJson(before) === orderedJson(next)) return;
      port.selection = next.blocks.length
        ? engineToViewSelection(bridge.getSelection(), JSON.stringify(next))
        : {
            type: "text",
            anchor: { blockId: "", offset: 0 },
            head: { blockId: "", offset: 0 },
          };
      // Native history owns identity-based undo; remote changes must preserve local entries.
      port.changed();
    },
  };
}
