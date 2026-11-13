import type { Decoration } from "@gotipe/core";
import type { AwarenessUser, CollaborationEditor, PeerState } from "./types";

/** Presence rules shared with GoTipe Cloud, which refuses frames that break them. */
const MAX_NAME = 256;
const MAX_AVATAR = 16 * 1024;
const COLOR = /^#[\da-f]{3}(?:[\da-f]{3})?$/i;
const AVATAR = /^(?:https?:|data:image\/)/i;

/**
 * Validates the local user once, at configuration time, and copies only the
 * fields peers read: an invalid user would otherwise be refused on every send.
 */
export function readLocalUser(value: unknown): AwarenessUser {
  const user = value as Partial<AwarenessUser> | null;
  if (!user || typeof user !== "object" || typeof user.name !== "string")
    throw new TypeError("Collaboration user needs a name string");
  if (user.name.length > MAX_NAME)
    throw new TypeError(`Collaboration user name exceeds ${MAX_NAME} characters`);
  if (typeof user.color !== "string" || !COLOR.test(user.color))
    throw new TypeError("Collaboration user color must be #rgb or #rrggbb");
  const result: AwarenessUser = { name: user.name, color: user.color };
  if (user.avatar !== undefined) {
    if (
      typeof user.avatar !== "string" ||
      !AVATAR.test(user.avatar) ||
      user.avatar.length > MAX_AVATAR
    )
      throw new TypeError(
        `Collaboration avatar must be an http(s) or data:image URL of at most ${MAX_AVATAR} characters`,
      );
    result.avatar = user.avatar;
  }
  return result;
}

/** The server-assigned identity of a presence frame, even when the rest is invalid. */
export function presencePeer(value: unknown): string | undefined {
  const peerId = (value as { peerId?: unknown } | null)?.peerId;
  return typeof peerId === "string" && peerId && peerId.length <= 256 ? peerId : undefined;
}

export function readAwareness(value: unknown): PeerState | { peerId: string; removed: true } {
  if (!value || typeof value !== "object") throw new Error("Invalid awareness message");
  const peer = value as Record<string, unknown>;
  const peerId = presencePeer(peer);
  if (!peerId) throw new Error("Invalid awareness peer identity");
  if (peer.removed === true) return { peerId, removed: true };
  const user = peer.user as Record<string, unknown> | undefined;
  if (
    !user ||
    typeof user.name !== "string" ||
    user.name.length > MAX_NAME ||
    typeof user.color !== "string" ||
    !COLOR.test(user.color) ||
    typeof peer.lastActive !== "number" ||
    !Number.isFinite(peer.lastActive)
  )
    throw new Error("Invalid awareness user");
  const result: PeerState = {
    peerId,
    user: { name: user.name, color: user.color },
    lastActive: peer.lastActive,
  };
  if (
    typeof user.avatar === "string" &&
    AVATAR.test(user.avatar) &&
    user.avatar.length <= MAX_AVATAR
  )
    result.user.avatar = user.avatar;
  if (peer.cursor) {
    const cursor = peer.cursor as Record<string, unknown>;
    if (!validBlock(cursor.blockId) || !validOffset(cursor.offset))
      throw new Error("Invalid awareness cursor");
    result.cursor = { blockId: cursor.blockId as string, offset: cursor.offset as number };
  }
  if (peer.selection) {
    const selection = peer.selection as Record<string, unknown>;
    if (
      !validBlock(selection.blockId) ||
      !validOffset(selection.from) ||
      !validOffset(selection.to) ||
      (selection.from as number) > (selection.to as number)
    )
      throw new Error("Invalid awareness selection");
    result.selection = {
      blockId: selection.blockId as string,
      from: selection.from as number,
      to: selection.to as number,
    };
  }
  return result;
}
function validBlock(value: unknown): boolean {
  return typeof value === "string" && value.length > 0;
}
function validOffset(value: unknown): boolean {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function localAwareness(editor: CollaborationEditor, peer: PeerState): PeerState {
  const { anchor, head } = editor.getViewState().selection;
  const selection =
    anchor.blockId && anchor.blockId === head.blockId && anchor.offset !== head.offset
      ? {
          blockId: anchor.blockId,
          from: Math.min(anchor.offset, head.offset),
          to: Math.max(anchor.offset, head.offset),
        }
      : undefined;
  return { ...peer, cursor: head.blockId ? head : undefined, selection, lastActive: Date.now() };
}

/** What peers see of a presence, without the clock: equal keys need no new frame. */
export function presenceKey(peer: PeerState): string {
  const cursor = peer.cursor ? [peer.cursor.blockId, peer.cursor.offset] : null;
  const selection = peer.selection
    ? [peer.selection.blockId, peer.selection.from, peer.selection.to]
    : null;
  return JSON.stringify([peer.user.name, peer.user.color, peer.user.avatar, cursor, selection]);
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
