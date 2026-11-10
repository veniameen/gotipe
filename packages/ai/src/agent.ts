import { type GoTipeEditor, defineExtension } from "@gotipe/core";
import { collectText, getRuntime, runAiTask } from "./runtime";
import type { AiAgentOptions, AiComment, AiProofreadSuggestion } from "./types";

export const defineAiAgent = defineExtension<AiAgentOptions>({
  name: "ai-agent",
  dependencies: ["ai", "ai-context"],
  onCreate(editor) {
    const runtime = getRuntime(editor);
    if (!runtime) return;
    if (this.options?.provider) runtime.manager.setProvider(this.options?.provider);
    runtime.cleanup.push(
      editor.on("executeAiCommand", (payload) => {
        if (!["freeText", "proofread", "addParagraph", "review"].includes(payload.commandId))
          return;
        runAiTask(editor, async () => {
          let command = payload.commandId;
          let prompt = payload.prompt?.trim() ?? "";
          if (command === "freeText") {
            const lower = prompt.toLowerCase();
            if (["proofread", "proofread document", "check grammar"].includes(lower))
              command = "proofread";
            else if (["review", "review document", "check document"].includes(lower))
              command = "review";
            else prompt = prompt.replace(/^add paragraph(?: about |:\s*)/i, "");
          }
          if (command === "proofread") {
            runtime.suggestions = await runtime.manager.proofread();
            editor.emit("aiProofreadChange", { suggestions: runtime.suggestions, currentIndex: 0 });
            editor.emit("aiStatusChange", {
              active: false,
              label: `Found ${runtime.suggestions.length} suggestions`,
            });
          } else if (command === "review") {
            runtime.comments = await runtime.manager.reviewComments();
            for (const comment of runtime.comments) editor.emit("commentAdded", comment.id);
            editor.emit("aiStatusChange", { active: false });
          } else {
            if (!prompt) throw new Error("Enter an AI prompt");
            const target = runtime.manager.captureTarget();
            runtime.manager.insertParagraph(
              await collectText(runtime.manager.streamGenerateParagraph(prompt)),
              target,
            );
          }
        });
      }),
    );
  },
});

export function getProofreadSuggestions(editor: GoTipeEditor): AiProofreadSuggestion[] {
  return structuredClone(getRuntime(editor)?.suggestions ?? []);
}
function publish(editor: GoTipeEditor): void {
  editor.emit("aiProofreadChange", {
    suggestions: getProofreadSuggestions(editor),
    currentIndex: 0,
  });
}
export function acceptProofreadSuggestion(editor: GoTipeEditor, suggestionId: string): void {
  const runtime = getRuntime(editor);
  const suggestion = runtime?.suggestions.find((item) => item.id === suggestionId);
  if (!runtime || !suggestion) return;
  runtime.manager.applyProofreadSuggestion(suggestion);
  runtime.suggestions = runtime.manager.rebaseProofreadSuggestions(
    runtime.suggestions.filter((item) => item.id !== suggestionId),
    [suggestion],
  );
  publish(editor);
}
export function rejectProofreadSuggestion(editor: GoTipeEditor, suggestionId: string): void {
  const runtime = getRuntime(editor);
  if (!runtime) return;
  runtime.suggestions = runtime.suggestions.filter((item) => item.id !== suggestionId);
  publish(editor);
}
export function acceptAllProofreadSuggestions(editor: GoTipeEditor): void {
  const runtime = getRuntime(editor);
  if (!runtime) return;
  runtime.manager.applyProofreadSuggestions(runtime.suggestions);
  runtime.suggestions = [];
  publish(editor);
}
export function rejectAllProofreadSuggestions(editor: GoTipeEditor): void {
  const runtime = getRuntime(editor);
  if (!runtime) return;
  runtime.suggestions = [];
  publish(editor);
}
export function getAiReviewComments(editor: GoTipeEditor): AiComment[] {
  return structuredClone(getRuntime(editor)?.comments ?? []);
}
