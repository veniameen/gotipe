import type { Decoration, GoTipeEditor } from "@gotipe/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface RemotePeer {
  peerId: string;
  user: { name: string; color: string };
  cursor?: { blockId: string; offset: number };
  selection?: { blockId: string; from: number; to: number };
}

/**
 * The decoration layer the collaboration provider writes other people into. `BlockEditor`
 * draws it with its own overlay (Atlas frame 12), so the document renderer leaves it out.
 */
export const COLLABORATION_LAYER = "collaboration";

/** People of `remote-cursor` and `remote-selection` decorations, one entry per peer. */
export function peersFromDecorations(decorations: readonly Decoration[]): RemotePeer[] {
  const peers = new Map<string, RemotePeer>();
  const peer = (peerId: string, color: string) => {
    let entry = peers.get(peerId);
    if (!entry) {
      entry = { peerId, user: { name: "", color } };
      peers.set(peerId, entry);
    }
    return entry;
  };
  for (const d of decorations) {
    if (d.type === "remote-cursor") {
      const entry = peer(d.peerId, d.user.color);
      entry.user = { name: d.user.name, color: d.user.color };
      entry.cursor = { blockId: d.blockId, offset: d.offset };
    } else if (d.type === "remote-selection")
      peer(d.peerId, d.color).selection = { blockId: d.blockId, from: d.from, to: d.to };
  }
  return [...peers.values()];
}

/**
 * Everyone the overlay draws, each person once: the host's `remotePeers` and the people of
 * the editor's collaboration layer; for the same peer ID the host's entry is drawn.
 */
export function useOverlayPeers(
  editor: GoTipeEditor | null,
  remotePeers: RemotePeer[] | undefined,
): RemotePeer[] {
  const [layerPeers, setLayerPeers] = useState<RemotePeer[]>([]);
  useEffect(() => {
    if (!editor) {
      setLayerPeers([]);
      return;
    }
    const read = () =>
      setLayerPeers(peersFromDecorations(editor.getDecorations(COLLABORATION_LAYER)));
    read();
    return editor.on("decorationsChange", ({ layer }) => {
      if (layer === COLLABORATION_LAYER) read();
    });
  }, [editor]);
  return useMemo(() => {
    if (!layerPeers.length) return remotePeers ?? [];
    const byId = new Map(layerPeers.map((peer) => [peer.peerId, peer]));
    for (const peer of remotePeers ?? []) byId.set(peer.peerId, peer);
    return [...byId.values()];
  }, [layerPeers, remotePeers]);
}

interface CursorPosition {
  peerId: string;
  user: { name: string; color: string };
  x: number;
  y: number;
  height: number;
}

interface SelectionRect {
  peerId: string;
  color: string;
  rects: { x: number; y: number; width: number; height: number }[];
}

/**
 * Resolve a character offset within a block element to an (x, y, height) position.
 * Walks text nodes inside the block and uses Range API for pixel coordinates.
 */
function getPositionInBlock(
  containerEl: HTMLElement,
  blockId: string,
  offset: number,
): { x: number; y: number; height: number } | null {
  const blockEl = containerEl.querySelector(`[data-block-id="${blockId}"]`);
  if (!blockEl) return null;

  const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
  let accumulated = 0;
  let textNode: Node | null;

  for (textNode = walker.nextNode(); textNode; textNode = walker.nextNode()) {
    const len = (textNode.textContent ?? "").length;
    if (accumulated + len >= offset) {
      const localOffset = Math.min(offset - accumulated, len);
      const range = document.createRange();
      range.setStart(textNode, localOffset);
      range.collapse(true);
      const rect = range.getBoundingClientRect();
      const containerRect = containerEl.getBoundingClientRect();
      return {
        x: rect.left - containerRect.left,
        y: rect.top - containerRect.top,
        height: rect.height || 20,
      };
    }
    accumulated += len;
  }

  // Offset beyond text — position at end of block
  const blockRect = (blockEl as HTMLElement).getBoundingClientRect();
  const containerRect = containerEl.getBoundingClientRect();
  return {
    x: blockRect.left - containerRect.left,
    y: blockRect.top - containerRect.top,
    height: blockRect.height || 20,
  };
}

/**
 * Get selection rectangles for a text range within a block.
 */
function getSelectionRects(
  containerEl: HTMLElement,
  blockId: string,
  from: number,
  to: number,
): { x: number; y: number; width: number; height: number }[] {
  const blockEl = containerEl.querySelector(`[data-block-id="${blockId}"]`);
  if (!blockEl) return [];

  const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
  let accumulated = 0;
  let startNode: Node | null = null;
  let startOffset = 0;
  let endNode: Node | null = null;
  let endOffset = 0;
  let textNode: Node | null;

  for (textNode = walker.nextNode(); textNode; textNode = walker.nextNode()) {
    const len = (textNode.textContent ?? "").length;
    if (!startNode && accumulated + len >= from) {
      startNode = textNode;
      startOffset = Math.min(from - accumulated, len);
    }
    if (accumulated + len >= to) {
      endNode = textNode;
      endOffset = Math.min(to - accumulated, len);
      break;
    }
    accumulated += len;
  }

  if (!startNode || !endNode) return [];

  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);

  const containerRect = containerEl.getBoundingClientRect();
  const clientRects = range.getClientRects();
  const result: { x: number; y: number; width: number; height: number }[] = [];

  for (let i = 0; i < clientRects.length; i++) {
    const r = clientRects[i]!;
    result.push({
      x: r.left - containerRect.left,
      y: r.top - containerRect.top,
      width: r.width,
      height: r.height,
    });
  }

  return result;
}

export interface CollaborationCursorsProps {
  peers: RemotePeer[];
  containerRef: React.RefObject<HTMLElement | null>;
}

export function CollaborationCursors({ peers, containerRef }: CollaborationCursorsProps) {
  const [cursors, setCursors] = useState<CursorPosition[]>([]);
  const [selections, setSelections] = useState<SelectionRect[]>([]);
  const rafRef = useRef<number>(0);

  const recalculate = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const newCursors: CursorPosition[] = [];
    const newSelections: SelectionRect[] = [];

    for (const peer of peers) {
      if (peer.cursor) {
        const pos = getPositionInBlock(container, peer.cursor.blockId, peer.cursor.offset);
        if (pos) {
          newCursors.push({
            peerId: peer.peerId,
            user: peer.user,
            x: pos.x,
            y: pos.y,
            height: pos.height,
          });
        }
      }

      if (peer.selection) {
        const rects = getSelectionRects(
          container,
          peer.selection.blockId,
          peer.selection.from,
          peer.selection.to,
        );
        if (rects.length > 0) {
          newSelections.push({
            peerId: peer.peerId,
            color: peer.user.color,
            rects,
          });
        }
      }
    }

    setCursors(newCursors);
    setSelections(newSelections);
  }, [peers, containerRef]);

  useEffect(() => {
    // Recalculate on peers change (debounced via rAF)
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(recalculate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [recalculate]);

  // Also recalculate on scroll/resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onScroll = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(recalculate);
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      container.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [containerRef, recalculate]);

  if (cursors.length === 0 && selections.length === 0) return null;

  return (
    <div className="gotipe-collaboration-cursors" aria-hidden="true">
      {/* Remote selections (rendered first, behind cursors) */}
      {selections.map((sel) =>
        sel.rects.map((rect, i) => (
          <div
            key={`${sel.peerId}-sel-${i}`}
            className="gotipe-remote-selection"
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              backgroundColor: sel.color,
            }}
          />
        )),
      )}

      {/* Remote cursors */}
      {cursors.map((cursor) => (
        <div
          key={cursor.peerId}
          className="gotipe-remote-cursor"
          data-peer-id={cursor.peerId}
          style={{
            left: cursor.x - 1,
            top: cursor.y,
            height: cursor.height,
          }}
        >
          <div
            className="gotipe-remote-cursor-caret"
            style={{ backgroundColor: cursor.user.color }}
          />
          <span
            className="gotipe-remote-cursor-label"
            style={{ backgroundColor: cursor.user.color }}
          >
            {cursor.user.name}
          </span>
        </div>
      ))}
    </div>
  );
}
