import type { BlockView, Decoration } from "@gotipe/core";
import type {
  CommentState,
  ProposalState,
  ReviewComment,
  ReviewLane,
  ReviewProposal,
  TextMap,
} from "../review-types";
import type { ReviewCache } from "./cache";

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
  /**
   * How the text of a growing proposal (`ReviewProposal.live`) is read while it is unfinished:
   * a Markdown codec closes an open code block and keeps marks without their pair as text.
   * Default: as it is.
   */
  liveText?: (text: string) => string;
  /**
   * What the last call found (`createReviewCache()`), one per editor: with it only what changed
   * is bound again, and the rest keeps its objects. A proposal or a comment is not to be changed
   * in place: a new text is a new object. Without it every call binds everything.
   */
  cache?: ReviewCache;
}

export interface ReviewOutput {
  decorations: Decoration[];
  proposals: ProposalState[];
  comments: CommentState[];
}
