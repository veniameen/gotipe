import {
  MESSAGE_LIMIT,
  baselineEnvelope,
  byteLength,
  operationsEnvelope,
  readOperations,
  readUpdate,
} from "./protocol";
import type { CollaborationEditor } from "./types";

/** Frames are filled to half of Cloud's message limit, so any ordinary operation fits. */
const FRAME_BYTES = MESSAGE_LIMIT / 2;
/** A transaction larger than a frame still goes whole when one message holds it. */
const MESSAGE_BYTES = MESSAGE_LIMIT - 1024;

/** What an ACK of a frame confirms. */
export type Receipt = { restored: number } | { through: number };
/**
 * Whole transactions: one message, or the parts of a transaction no message
 * holds. Every part but the last continues; Cloud acknowledges the last one.
 */
export interface Frame {
  payloads: Uint8Array[];
  receipt: Receipt;
  /** More operations were ready than this frame could take. */
  backlog: boolean;
}
type Read = ReturnType<typeof readOperations<"remaining">>;

/**
 * Decides what one replica still has to send. The server confirms frames in
 * order and a replica's clocks only grow, so its confirmed operations are a
 * prefix: one Lamport clock, `acknowledged`, replaces a set of every ID.
 * Operations that came from elsewhere and the server lacks (a local copy made
 * under another peer ID) are found once per handshake and sent first, as one
 * transaction because where theirs ended is unknown. A frame never ends inside
 * a transaction, so a peer never projects half of one.
 */
export class Outbox {
  private acknowledged = 0;
  private restored: { json: string; bytes: number }[] = [];
  /** Serialized baseline, read once: only `gotipe.crdt/1` frames repeat it. */
  private base: { json: string; bytes: number } | null = null;
  /**
   * The server refused the next transaction whole (`UPDATE_TOO_LARGE`): send it
   * in frames that each stand alone. Peers then see it in pieces, which their
   * schema may refuse until the last piece arrives (see the provider), but the
   * edit and every later one can still be saved.
   */
  private splitting = false;

  /** After the server's full state was merged into the editor. */
  synchronize(editor: CollaborationEditor, fullState: Uint8Array): void {
    const missing = readOperations(
      editor.getCollaborationUpdate({ missingFrom: fullState }),
      "acknowledged",
    );
    this.acknowledged = missing.acknowledged;
    this.restored = missing.operations.map((operation) => {
      const json = JSON.stringify(operation);
      return { json, bytes: byteLength(json) + 1 };
    });
  }

  /** The connection ended: restored operations are found again by the next handshake. */
  disconnect(): void {
    this.restored = [];
  }

  /**
   * The next frame, or null when the server has everything. With a generation
   * it is `gotipe.crdt/2`; without one the frame repeats the baseline and must
   * fit into one message.
   */
  next(editor: CollaborationEditor, generation: string | null): Frame | null {
    const base = generation === null ? this.baseline(editor) : null;
    const overhead = base ? base.bytes + 64 : 256;
    const frame = Math.max(1, FRAME_BYTES - overhead);
    const message = Math.max(1, MESSAGE_BYTES - overhead);
    let parts: string[][];
    let receipt: Receipt;
    let backlog = false;
    if (this.restored.length) {
      const total = this.restored.reduce((sum, operation) => sum + operation.bytes, 0);
      parts = [[]];
      let size = 0;
      for (const operation of this.restored) {
        // One message holds them all: no need for parts.
        const split = this.splitting || total > message;
        if (split && parts.at(-1)!.length && size + operation.bytes > frame) {
          parts.push([]);
          size = 0;
        }
        parts.at(-1)!.push(operation.json);
        size += operation.bytes;
      }
      receipt = { restored: this.restored.length };
      if (this.splitting) {
        parts = parts.slice(0, 1);
        receipt = { restored: parts[0]!.length };
        this.splitting = parts[0]!.length < this.restored.length;
      }
    } else if (this.splitting) {
      const read = this.read(editor, this.acknowledged, frame);
      if (!read.operations.length) return null;
      parts = [read.operations.map((operation) => JSON.stringify(operation))];
      receipt = { through: read.operations.at(-1)!.id.lamport };
      this.splitting = read.continues;
      backlog = read.continues || read.remaining > 0;
    } else {
      const reads = this.local(editor, frame, message);
      if (!reads) return null;
      parts = reads.map((read) => read.operations.map((operation) => JSON.stringify(operation)));
      receipt = { through: reads.at(-1)!.operations.at(-1)!.id.lamport };
      backlog = reads.at(-1)!.remaining > 0;
    }
    if (base && parts.length > 1)
      throw new Error(
        "A transaction larger than one message cannot be sent over gotipe.crdt/1: connect with collaboration_state.generation",
      );
    const payloads = parts.map((operations, index) =>
      base
        ? baselineEnvelope(base.json, operations)
        : operationsEnvelope(generation ?? "", operations, index < parts.length - 1),
    );
    // One byte of the message is its type.
    if (payloads.some((payload) => payload.length >= MESSAGE_LIMIT))
      throw new Error(
        base && base.bytes >= FRAME_BYTES
          ? "The document is too large for gotipe.crdt/1 updates, which repeat it: connect with collaboration_state.generation"
          : "An operation exceeds the collaboration message limit of 1 MiB and cannot be synced",
      );
    return { payloads, receipt, backlog };
  }

  /** Sends the next transaction in standalone frames: the server cannot take it whole. */
  split(): void {
    this.splitting = true;
  }

  acknowledge(receipt: Receipt): void {
    if ("restored" in receipt) this.restored.splice(0, receipt.restored);
    else this.acknowledged = Math.max(this.acknowledged, receipt.through);
  }

  /** Operations the server has not confirmed. */
  pending(editor: CollaborationEditor): number {
    const local = this.read(editor, this.acknowledged, 1);
    return this.restored.length + local.operations.length + local.remaining;
  }

  /**
   * Own operations after `acknowledged`: whole transactions up to a frame, a
   * transaction larger than a frame whole when a message holds it, otherwise
   * its parts in frames.
   */
  private local(editor: CollaborationEditor, frame: number, message: number): Read[] | null {
    let read = this.read(editor, this.acknowledged, frame);
    if (!read.operations.length) return null;
    if (read.continues) read = this.read(editor, this.acknowledged, message);
    if (!read.continues) return [read];
    read = this.read(editor, this.acknowledged, frame);
    const reads = [read];
    while (read.continues) {
      read = this.read(editor, read.operations.at(-1)!.id.lamport, frame);
      reads.push(read);
    }
    return reads;
  }
  private read(editor: CollaborationEditor, after: number, maxBytes: number): Read {
    return readOperations(editor.getCollaborationUpdate({ after, maxBytes }), "remaining");
  }

  private baseline(editor: CollaborationEditor): { json: string; bytes: number } {
    if (!this.base) {
      const json = JSON.stringify(readUpdate(editor.getCollaborationUpdate()).base);
      this.base = { json, bytes: byteLength(json) };
    }
    return this.base;
  }
}
