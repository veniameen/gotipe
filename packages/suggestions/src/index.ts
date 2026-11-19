export { defineSuggestions, getSuggestionsManager } from "./extension";
export type { Suggestion, SuggestionState, SuggestionsOptions } from "./types";
export { SuggestionsManager } from "./manager";
export type { SuggestionsSnapshot } from "./persistence";
export {
  findAnchor,
  locateEdits,
  applyAnchoredEdits,
  editsOverlap,
  anchorWindowsOverlap,
  anchorAt,
} from "./anchors";
export type {
  TextAnchor,
  AnchoredEdit,
  AnchorMatch,
  AnchorFailure,
  LocatedEdit,
  LocateResult,
  ApplyResult,
} from "./anchors";
export {
  computeReviewDecorations,
  createReviewCache,
  mapOffsetToText,
  mapRangeToText,
  proposalsInDocumentOrder,
  revealDecorations,
} from "./review-decorations";
export type { ReviewCache, ReviewInput, ReviewOutput } from "./review-decorations";
export type {
  ReviewLane,
  ReviewProposal,
  ReviewComment,
  ReviewReply,
  LaneCursor,
  TextMap,
  ReviewPosition,
  ProposalState,
  CommentState,
} from "./review-types";
