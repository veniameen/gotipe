import type { AnchoredEdit, TextAnchor } from "./anchors";

/**
 * A lane — one output of the model on the page (the agent, a Skill, a tool)
 * or the person. Its colour is any CSS colour, typically a variable such as
 * `var(--gt-track-2)`.
 */
export interface ReviewLane {
  id: string;
  /** Display name: «Агент», «company-lint», «psql». */
  name: string;
  kind: "agent" | "skill" | "tool" | "user";
  color?: string;
}

/** A model edit waiting for the person (ADR-0047 «предложение»). */
export interface ReviewProposal {
  id: string;
  laneId: string;
  edits: AnchoredEdit[];
  /** One line on why (shown on the card). */
  reason?: string;
  /** Set by the host when it already knows the proposal is stale. */
  status?: "pending" | "stale";
  createdAt?: string;
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
 * stored. Placed at the end of a proposal's text (`proposalId`) or at an
 * anchor's quote.
 */
export interface LaneCursor {
  laneId: string;
  proposalId?: string;
  anchor?: TextAnchor;
  /** What the output does: «Дописывает порядок». */
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
  status: "pending" | "stale";
  reason?: "missing" | "ambiguous" | "overlap";
  /** First place of the change in the editor (for cards and cursors). */
  position: ReviewPosition | null;
  /** End of the inserted text, if any (the cursor sits there). */
  insertEnd: ReviewPosition | null;
  /** Top-level blocks the change touches. */
  blockIds: string[];
  /** Exact inline highlight (false: whole blocks are highlighted). */
  exact: boolean;
  /** Characters of new text shown (for the reveal animation). */
  insertedChars: number;
}

export interface CommentState {
  id: string;
  status: "anchored" | "stale";
  position: ReviewPosition | null;
}
