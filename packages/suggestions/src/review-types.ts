import type { AnchoredEdit, TextAnchor } from "./anchors";

/**
 * A lane — one output of the model on the page (the agent, a Skill, a tool)
 * or the person. Its colour is any CSS colour, typically a variable such as
 * `var(--gt-track-2)`.
 */
export interface ReviewLane {
  id: string;
  /** Display name: “Agent”, “company-lint”, “psql”. */
  name: string;
  kind: "agent" | "skill" | "tool" | "user";
  color?: string;
}

/** A model edit waiting for the person (ADR-0047 “suggestion”). */
export interface ReviewProposal {
  id: string;
  laneId: string;
  edits: AnchoredEdit[];
  /** One line on why (shown on the card). */
  reason?: string;
  /** Set by the host when it already knows the proposal is stale. */
  status?: "pending" | "stale";
  createdAt?: string;
  /**
   * The proposal is still being written: as its text grows the host gives a new object with a
   * longer `edits[].text` under the same `id`. It is shown without the reveal animation and
   * takes no decision (no Accept or Reject, not part of “Accept all” or “Reject all”); its
   * state is `"live"`. Without `live` under the same `id` it is an ordinary proposal, and its
   * text is not revealed again.
   */
  live?: boolean;
  /**
   * Where the proposal stands among those that insert at the same point: ascending, 0 when not
   * given; equal ones stand in the order of `proposals`.
   */
  order?: number;
}

export interface ReviewReply {
  id: string;
  author: string;
  text: string;
  createdAt?: string;
}

/** A comment on a quoted range (a note or a question from a lane). */
export interface ReviewComment {
  id: string;
  laneId: string;
  anchor: TextAnchor;
  text: string;
  /** A question waits for the person's reply. */
  question?: boolean;
  replies?: ReviewReply[];
  createdAt?: string;
}

/**
 * A lane's cursor: where an output is working right now. Short-lived, never
 * stored. Placed at the end of a proposal's text (`proposalId`; where the text of a growing
 * proposal will start while it has none) or at an anchor's quote.
 */
export interface LaneCursor {
  laneId: string;
  /** The cursor's own key: several cursors of one lane each need one. Default: `laneId`. */
  id?: string;
  /** The name on the cursor's flag instead of the lane's. */
  name?: string;
  /** A flag in one line, name then label (`data-compact` on the cursor). */
  compact?: boolean;
  proposalId?: string;
  anchor?: TextAnchor;
  /** What the output does: “Writing the steps”. */
  label?: string;
}

/** Text ⇄ markdown mapping produced by a codec (structurally `MarkdownMap` of @gotipe/markdown). */
export interface TextMap {
  blocks: { blockId: string; start: number; end: number; depth: number }[];
  segments: {
    blockId: string;
    textFrom: number;
    textTo: number;
    mdFrom: number;
    mdTo: number;
    exact: boolean;
  }[];
}

/** Where a proposal/comment sits in the editor. */
export interface ReviewPosition {
  blockId: string;
  offset: number;
}

export interface ProposalState {
  id: string;
  /** `live`: the host is still writing it (`ReviewProposal.live`), whether or not it has a place. */
  status: "pending" | "stale" | "live";
  /** Why it has no place: of a stale proposal, or of a live one whose anchor is not found. */
  reason?: "missing" | "ambiguous" | "overlap";
  /** First place of the change in the editor (for cards and cursors). */
  position: ReviewPosition | null;
  /**
   * End of the inserted text, if any (the cursor sits there). Of a live proposal with no text
   * yet: where its text will start.
   */
  insertEnd: ReviewPosition | null;
  /** Top-level blocks the change touches. */
  blockIds: string[];
  /** Exact inline highlight (false: whole blocks are highlighted). */
  exact: boolean;
  /** Characters of new text to reveal; 0 of a live proposal, which is never revealed. */
  insertedChars: number;
}

export interface CommentState {
  id: string;
  status: "anchored" | "stale";
  position: ReviewPosition | null;
}
