import type { GoTipeEditor } from "@gotipe/core";
import type { AwarenessUser, PeerState } from "./provider";

// Public methods keep their JSDoc on a signature without a body: TypeScript keeps it in the
// declarations, while a comment inside the class body would ship in the bundle (D-167).
/**
 * In-memory collaboration bridge that syncs multiple editors
 * without a WebSocket server. Designed for local demos and testing.
 *
 * Usage:
 *   const bridge = new LocalCollaborationBridge();
 *   bridge.join('alice', editor1, { name: 'Alice', color: '#FF6B6B' });
 *   bridge.join('bob', editor2, { name: 'Bob', color: '#4ECDC4' });
 *   // editors now stay in sync
 */
export class LocalCollaborationBridge {
  private editors = new Map<string, GoTipeEditor>();
  private peers = new Map<string, PeerState>();
  private unsubscribes = new Map<string, (() => void)[]>();
  private applying = false;
  private peersChangeCallbacks = new Set<(peers: PeerState[]) => void>();

  /**
   * Join an editor to the collaboration session.
   * Changes from this editor will be broadcast to all others.
   */
  join(peerId: string, editor: GoTipeEditor, user: AwarenessUser): void;
  join(peerId: string, editor: GoTipeEditor, user: AwarenessUser): void {
    if (editor.isDestroyed) throw new Error("Cannot join a destroyed editor");
    const existing = this.editors.get(peerId);
    if (existing && existing !== editor) throw new Error("Peer identity is already in use");
    if (existing) return;
    editor.enableCollaboration(peerId);
    this.applying = true;
    try {
      // Late joiners replay the real operation log before their first edit.
      const source = this.editors.values().next().value;
      if (source) {
        editor.receiveCollaborationUpdate(source.getCollaborationUpdate());
        const update = editor.getCollaborationUpdate();
        for (const other of this.editors.values()) other.receiveCollaborationUpdate(update);
      }
    } finally {
      this.applying = false;
    }
    this.editors.set(peerId, editor);
    this.peers.set(peerId, {
      peerId,
      user,
      lastActive: Date.now(),
    });

    const unsubs: (() => void)[] = [];

    // Sync state on update (after dispatch/setContent)
    unsubs.push(
      editor.on("update", () => {
        if (this.applying) return;
        this.applying = true;
        try {
          const update = editor.getCollaborationUpdate();
          for (const [id, other] of this.editors) {
            if (id !== peerId) {
              other.receiveCollaborationUpdate(update);
            }
          }
        } finally {
          this.applying = false;
        }
      }),
    );

    // Track cursor/selection for awareness
    unsubs.push(
      editor.on("selectionChange", () => {
        this.updateAwareness(peerId, editor);
      }),
    );

    unsubs.push(editor.on("destroy", () => this.leave(peerId)));

    unsubs.push(
      editor.on("focus", () => {
        this.updateAwareness(peerId, editor);
      }),
    );

    this.unsubscribes.set(peerId, unsubs);
    this.notifyPeersChange();
  }

  private updateAwareness(peerId: string, editor: GoTipeEditor): void {
    const state = editor.getViewState();
    const sel = state.selection;
    const existing = this.peers.get(peerId);
    if (!existing) return;

    const isRange =
      sel.anchor.blockId === sel.head.blockId && sel.anchor.offset !== sel.head.offset;

    this.peers.set(peerId, {
      ...existing,
      cursor: sel.anchor.blockId
        ? { blockId: sel.anchor.blockId, offset: sel.anchor.offset }
        : undefined,
      selection: isRange
        ? {
            blockId: sel.anchor.blockId,
            from: Math.min(sel.anchor.offset, sel.head.offset),
            to: Math.max(sel.anchor.offset, sel.head.offset),
          }
        : undefined,
      lastActive: Date.now(),
    });

    this.notifyPeersChange();
  }

  /**
   * Get all peers except the specified one (for showing remote cursors).
   */
  getPeersFor(peerId: string): PeerState[];
  getPeersFor(peerId: string): PeerState[] {
    return Array.from(this.peers.values()).filter((p) => p.peerId !== peerId);
  }

  /**
   * Get all peers.
   */
  getAllPeers(): PeerState[];
  getAllPeers(): PeerState[] {
    return Array.from(this.peers.values());
  }

  /**
   * Register a callback for peer state changes.
   */
  onPeersChange(callback: (peers: PeerState[]) => void): () => void;
  onPeersChange(callback: (peers: PeerState[]) => void): () => void {
    this.peersChangeCallbacks.add(callback);
    return () => this.peersChangeCallbacks.delete(callback);
  }

  private notifyPeersChange(): void {
    const allPeers = this.getAllPeers();
    for (const cb of this.peersChangeCallbacks) {
      cb(allPeers);
    }
  }

  /**
   * Remove an editor from the session.
   */
  leave(peerId: string): void;
  leave(peerId: string): void {
    const unsubs = this.unsubscribes.get(peerId);
    if (unsubs) {
      for (const unsub of unsubs) unsub();
    }
    this.unsubscribes.delete(peerId);
    this.editors.delete(peerId);
    this.peers.delete(peerId);
    this.notifyPeersChange();
  }

  /**
   * Disconnect all editors and clean up.
   */
  destroy(): void;
  destroy(): void {
    for (const [peerId] of this.editors) {
      this.leave(peerId);
    }
    this.peersChangeCallbacks.clear();
  }
}
