import type { BlockView, Decoration } from "@gotipe/core";
import type {
  CommentState,
  ProposalState,
  ReviewComment,
  ReviewLane,
  ReviewProposal,
  TextMap,
} from "../review-types";

export interface ReviewInput {
  /** The editor document (view-state blocks). */
  blocks: BlockView[];
  /** The document serialized by the codec (e.g. Markdown). */
  text: string;
  /** Codec map for `text`. */
  map: TextMap;
  /** Parses a fragment of the codec format into top-level blocks (fresh ids). */
  parse: (fragment: string) => BlockView[];
  proposals: ReviewProposal[];
  comments?: ReviewComment[];
  lanes: ReviewLane[];
  /** Highlighted proposal or comment (its card is open). */
  activeId?: string | null;
}

export interface ReviewOutput {
  decorations: Decoration[];
  proposals: ProposalState[];
  comments: CommentState[];
}
