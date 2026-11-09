import { type GoTipeEditor, defineExtension } from "@gotipe/core";
import type { AiManager } from "./manager";
import type { AiAgentOptions, AiComment, AiProofreadSuggestion } from "./types";

function getManager(editor: GoTipeEditor): AiManager | null {
  return ((editor as unknown as Record<string, unknown>).__aiManager as AiManager) ?? null;
}

/**
 * Level 3 — AIAgent extension.
 *
 * Adds the "agent toolkit" capabilities:
 * - AI Command Bar routing (free text, proofread, add paragraph, review)
 * - AI Proofread (document scan → suggestions with toolbar)
 * - AI Comments (document review → comment threads)
 * - AI Add Paragraph (contextual paragraph as streamed diff)
 * - AI Status Indicator (emits `aiStatusChange` during processing)
 *
 * Requires both `defineAi` (base) and `defineAiContext` (Level 2) extensions.
 * The AI Command Bar UI component already exists — this extension handles
 * the command routing logic.
 */
export const defineAiAgent = defineExtension<AiAgentOptions>({
  name: "ai-agent",
  dependencies: ["ai", "ai-context"],

  keybindings: [
    {
      key: "mod-k",
      command(_editor: GoTipeEditor): boolean {
        // The AI Command Bar component handles its own toggle via document keydown.
        // This keybinding is a fallback to ensure it works if the component
        // hasn't mounted its own listener yet.
        return false;
      },
    },
  ],

  onCreate(editor: GoTipeEditor) {
    const opts = this.options as AiAgentOptions;
    const manager = getManager(editor);

    if (opts?.provider && manager) {
      manager.setProvider(opts.provider);
    }

    // Listen for command bar commands and route them
    editor.on("executeAiCommand", (payload) => {
      if (!manager) return;

      const prompt = payload.prompt ?? "";

      switch (payload.commandId) {
        case "freeText":
          routeFreeText(editor, manager, prompt);
          break;
        case "proofread":
          handleProofread(editor, manager);
          break;
        case "addParagraph":
          handleAddParagraph(editor, manager, prompt);
          break;
        case "review":
          handleReviewComments(editor, manager);
          break;
      }
    });
  },
});

/**
 * Routes free-text commands from the AI Command Bar.
 * Detects intent from the prompt text and dispatches to the appropriate handler.
 */
function routeFreeText(editor: GoTipeEditor, manager: AiManager, prompt: string): void {
  const lower = prompt.toLowerCase().trim();

  if (lower === "proofread" || lower === "proofread document" || lower === "check grammar") {
    handleProofread(editor, manager);
    return;
  }

  if (lower === "review" || lower === "review document" || lower === "check document") {
    handleReviewComments(editor, manager);
    return;
  }

  if (lower.startsWith("add paragraph about ") || lower.startsWith("add paragraph:")) {
    const topic = lower.startsWith("add paragraph about ")
      ? prompt.slice("add paragraph about ".length).trim()
      : prompt.slice("add paragraph:".length).trim();
    handleAddParagraph(editor, manager, topic);
    return;
  }

  // Default: generate content from free text
  handleFreeTextGeneration(editor, manager, prompt);
}

/**
 * AI Proofread: scans the entire document and creates suggestions.
 * Emits a custom event so the UI (SuggestionToolbar) can display them.
 */
async function handleProofread(editor: GoTipeEditor, manager: AiManager): Promise<void> {
  editor.emit("aiStatusChange", { active: true, label: "Proofreading document..." });

  const suggestions = await manager.proofread();

  // Store suggestions on the editor for the UI layer to consume
  const store = editor as unknown as Record<string, unknown>;
  store.__aiProofreadSuggestions = suggestions;

  editor.emit("aiStatusChange", {
    active: false,
    label:
      suggestions.length > 0
        ? `Found ${suggestions.length} suggestion${suggestions.length === 1 ? "" : "s"}`
        : undefined,
  });
}

/**
 * AI Review Comments: scans the document and creates comment threads.
 */
async function handleReviewComments(editor: GoTipeEditor, manager: AiManager): Promise<void> {
  editor.emit("aiStatusChange", { active: true, label: "Reviewing document..." });

  const comments = await manager.reviewComments();

  // Store comments and emit events for each
  const store = editor as unknown as Record<string, unknown>;
  store.__aiReviewComments = comments;

  for (const comment of comments) {
    editor.emit("commentAdded", comment.id);
  }

  editor.emit("aiStatusChange", { active: false });
}

/**
 * AI Add Paragraph: generates a contextual paragraph and streams it into the document.
 */
async function handleAddParagraph(
  editor: GoTipeEditor,
  manager: AiManager,
  topic: string,
): Promise<void> {
  editor.emit("aiStatusChange", { active: true, label: "Generating paragraph..." });

  editor.chain().insertBlockAfter("paragraph").run();

  const state = editor.getViewState();
  const newBlock = state.blocks[state.blocks.length - 1];
  if (!newBlock) {
    editor.emit("aiStatusChange", { active: false });
    return;
  }

  let offset = 0;
  for await (const chunk of manager.streamGenerateParagraph(topic)) {
    editor.dispatch({
      steps: [
        {
          type: "insertText",
          blockId: newBlock.id,
          offset,
          text: chunk,
          marks: [],
        },
      ],
    });
    offset += chunk.length;
  }

  editor.emit("aiStatusChange", { active: false });
}

/**
 * Free-text generation: takes the prompt as-is and generates a response,
 * streaming it into a new paragraph.
 */
async function handleFreeTextGeneration(
  editor: GoTipeEditor,
  manager: AiManager,
  prompt: string,
): Promise<void> {
  editor.emit("aiStatusChange", { active: true, label: "Using AI toolkit..." });

  editor.chain().insertBlockAfter("paragraph").run();

  const state = editor.getViewState();
  const newBlock = state.blocks[state.blocks.length - 1];
  if (!newBlock) {
    editor.emit("aiStatusChange", { active: false });
    return;
  }

  let offset = 0;
  for await (const chunk of manager.streamGenerateParagraph(prompt)) {
    editor.dispatch({
      steps: [
        {
          type: "insertText",
          blockId: newBlock.id,
          offset,
          text: chunk,
          marks: [],
        },
      ],
    });
    offset += chunk.length;
  }

  editor.emit("aiStatusChange", { active: false });
}

/**
 * Helper to get stored proofread suggestions from the editor instance.
 * Used by the application layer to pass suggestions to SuggestionToolbar.
 */
export function getProofreadSuggestions(editor: GoTipeEditor): AiProofreadSuggestion[] {
  return (
    ((editor as unknown as Record<string, unknown>).__aiProofreadSuggestions as
      | AiProofreadSuggestion[]
      | undefined) ?? []
  );
}

/**
 * Helper to accept a proofread suggestion and remove it from the list.
 */
export function acceptProofreadSuggestion(editor: GoTipeEditor, suggestionId: string): void {
  const manager = getManager(editor);
  if (!manager) return;

  const store = editor as unknown as Record<string, unknown>;
  const suggestions = (store.__aiProofreadSuggestions as AiProofreadSuggestion[] | undefined) ?? [];
  const suggestion = suggestions.find((s) => s.id === suggestionId);
  if (!suggestion) return;

  manager.applyProofreadSuggestion(suggestion);
  store.__aiProofreadSuggestions = suggestions.filter((s) => s.id !== suggestionId);
}

/**
 * Helper to reject a proofread suggestion (remove without applying).
 */
export function rejectProofreadSuggestion(editor: GoTipeEditor, suggestionId: string): void {
  const store = editor as unknown as Record<string, unknown>;
  const suggestions = (store.__aiProofreadSuggestions as AiProofreadSuggestion[] | undefined) ?? [];
  store.__aiProofreadSuggestions = suggestions.filter((s) => s.id !== suggestionId);
}

/**
 * Helper to accept all proofread suggestions at once.
 * Applies them in reverse order (bottom to top) to preserve offsets.
 */
export function acceptAllProofreadSuggestions(editor: GoTipeEditor): void {
  const manager = getManager(editor);
  if (!manager) return;

  const store = editor as unknown as Record<string, unknown>;
  const suggestions = (store.__aiProofreadSuggestions as AiProofreadSuggestion[] | undefined) ?? [];

  // Sort in reverse document order so applying earlier ones doesn't shift later offsets
  const sorted = [...suggestions].sort((a, b) => {
    if (a.blockId !== b.blockId) return 0;
    return b.from - a.from;
  });

  for (const suggestion of sorted) {
    manager.applyProofreadSuggestion(suggestion);
  }

  store.__aiProofreadSuggestions = [];
}

/**
 * Helper to reject all proofread suggestions at once.
 */
export function rejectAllProofreadSuggestions(editor: GoTipeEditor): void {
  const store = editor as unknown as Record<string, unknown>;
  store.__aiProofreadSuggestions = [];
}

/**
 * Helper to get stored AI review comments from the editor instance.
 */
export function getAiReviewComments(editor: GoTipeEditor): AiComment[] {
  return (
    ((editor as unknown as Record<string, unknown>).__aiReviewComments as
      | AiComment[]
      | undefined) ?? []
  );
}
