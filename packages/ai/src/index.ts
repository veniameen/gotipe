export { defineAi, AiPreset, getAiManager } from "./extension";
export { defineAiContext } from "./context";
export {
  defineAiAgent,
  getProofreadSuggestions,
  acceptProofreadSuggestion,
  rejectProofreadSuggestion,
  acceptAllProofreadSuggestions,
  rejectAllProofreadSuggestions,
  getAiReviewComments,
} from "./agent";
export type {
  AiProvider,
  AiOptions,
  AiSuggestion,
  AiProofreadSuggestion,
  AiComment,
  AiCommand,
  AiContext,
  AiContextOptions,
  AiAgentOptions,
  AiStatus,
  AiTask,
} from "./types";
export { AiManager } from "./manager";
export { buildAiContext, captureTarget as captureAiTarget } from "./document";
export type { AiTarget } from "./document";
export { detectPii } from "./pii";
export type { PiiMatch } from "./pii";
