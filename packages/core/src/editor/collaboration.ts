import { engineToViewSelection, viewToEngineSelection } from "../document/selection";
import { fromWasmDoc } from "../engine/conversion";
import { GoTipeError } from "../error";
import type { InlineAtomSupport, IsAtomic } from "../types/atoms";
import type { Step } from "../types/state";
import type { SelectionView } from "../types/view";
import type { CollaborationUpdateOptions, WasmBridge } from "../wasm-bridge";

interface CollaborationPort {
  readonly destroyed: boolean;
  selection: SelectionView;
  resetHistory(): void;
  changed(): void;
  beforeMutation(reason: string): void;
  /** Atomic marks of the schema; null when it declares none. */
  readonly isAtomic: IsAtomic | null;
  /** The repair of atoms, from the extensions that supply atom support. */
  readonly atoms?: Pick<InlineAtomSupport, "repairRemote"> | null;
  /** Dispatches a local repair transaction. */
  repair(transaction: { steps: Step[]; metadata: { addToHistory: false } }): void;
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

/** Rejects a request the engine would coerce: clocks and sizes are exact integers. */
function assertUpdateOptions(options: CollaborationUpdateOptions): void {
  const invalid = (message: string) => new GoTipeError("COLLABORATION_ERROR", message);
  if ("missingFrom" in options) {
    if (!(options.missingFrom instanceof Uint8Array))
      throw invalid("missingFrom must be the bytes of a full collaboration state");
    return;
  }
  if (!Number.isSafeInteger(options.after) || options.after < 0)
    throw invalid("after must be a Lamport clock: a non-negative safe integer");
  const { maxBytes } = options;
  if (
    maxBytes !== undefined &&
    (!Number.isInteger(maxBytes) || maxBytes < 0 || maxBytes > 2 ** 32 - 1)
  )
    throw invalid("maxBytes must be a non-negative 32-bit integer");
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
    getUpdate(options?: CollaborationUpdateOptions): Uint8Array {
      assertEnabled();
      if (options) assertUpdateOptions(options);
      return bridge.getUpdate(options).slice();
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
      // Text a peer typed into an inline atom it did not know loses the atomic marks
      // (docs/development/inline-atoms.md). The repair is a local transaction, so every
      // replica receives it; concurrent repairs remove the same marks and converge.
      if (!port.isAtomic || !port.atoms) return;
      const steps = port.atoms.repairRemote(fromWasmDoc(before), fromWasmDoc(next), port.isAtomic);
      if (steps.length) port.repair({ steps, metadata: { addToHistory: false } });
    },
  };
}
