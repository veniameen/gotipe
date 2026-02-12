export { defineAi, AiPreset } from "./extension";
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
} from "./types";
export { AiManager } from "./manager";
