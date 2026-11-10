import type { Decoration } from "@gotipe/core";
import type { CollaborationEditor, PeerState } from "./types";

export function readAwareness(value: unknown): PeerState | { peerId: string; removed: true } {
  if (!value || typeof value !== "object") throw new Error("Invalid awareness message");
  const peer = value as Record<string, unknown>;
  if (typeof peer.peerId !== "string" || !peer.peerId || peer.peerId.length > 256)
    throw new Error("Invalid awareness peer identity");
  if (peer.removed === true) return { peerId: peer.peerId, removed: true };
  const user = peer.user as Record<string, unknown> | undefined;
  if (
    !user ||
    typeof user.name !== "string" ||
    user.name.length > 256 ||
    typeof user.color !== "string" ||
    !/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(user.color) ||
    typeof peer.lastActive !== "number" ||
    !Number.isFinite(peer.lastActive)
  )
    throw new Error("Invalid awareness user");
  const result: PeerState = {
    peerId: peer.peerId,
    user: { name: user.name, color: user.color },
    lastActive: peer.lastActive,
  };
  if (typeof user.avatar === "string" && /^(https?:|data:image\/)/i.test(user.avatar))
    result.user.avatar = user.avatar;
  if (peer.cursor) {
    const cursor = peer.cursor as Record<string, unknown>;
    if (typeof cursor.blockId !== "string" || !validOffset(cursor.offset))
      throw new Error("Invalid awareness cursor");
    result.cursor = { blockId: cursor.blockId, offset: cursor.offset as number };
  }
  if (peer.selection) {
    const selection = peer.selection as Record<string, unknown>;
    if (
      typeof selection.blockId !== "string" ||
      !validOffset(selection.from) ||
      !validOffset(selection.to) ||
      (selection.from as number) > (selection.to as number)
    )
      throw new Error("Invalid awareness selection");
    result.selection = {
      blockId: selection.blockId,
      from: selection.from as number,
      to: selection.to as number,
    };
  }
  return result;
}
function validOffset(value: unknown): boolean {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function localAwareness(editor: CollaborationEditor, peer: PeerState): PeerState {
  const { anchor, head } = editor.getViewState().selection;
  const selection =
    anchor.blockId === head.blockId && anchor.offset !== head.offset
      ? {
          blockId: anchor.blockId,
          from: Math.min(anchor.offset, head.offset),
          to: Math.max(anchor.offset, head.offset),
        }
      : undefined;
  return { ...peer, cursor: head.blockId ? head : undefined, selection, lastActive: Date.now() };
}

export function peerDecorations(peers: PeerState[]): Decoration[] {
  return peers.flatMap((peer) => {
    const result: Decoration[] = [];
    if (peer.cursor)
      result.push({ type: "remote-cursor", peerId: peer.peerId, ...peer.cursor, user: peer.user });
    if (peer.selection)
      result.push({
        type: "remote-selection",
        peerId: peer.peerId,
        ...peer.selection,
        color: peer.user.color,
      });
    return result;
  });
}
