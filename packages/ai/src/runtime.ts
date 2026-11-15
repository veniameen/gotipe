import { type GoTipeEditor, GoTipeError } from "@gotipe/core";
import type { AiManager } from "./manager";
import { AiReview } from "./review";
import type { AiProofreadSuggestion } from "./types";

export interface AiRuntime {
  manager: AiManager;
  suggestions: AiProofreadSuggestion[];
  /** The last review's comments; they follow the text of their blocks (D-181). */
  review: AiReview;
  cleanup: (() => void)[];
}
const runtimes = new WeakMap<GoTipeEditor, AiRuntime>();
export function getRuntime(editor: GoTipeEditor): AiRuntime | undefined {
  return runtimes.get(editor);
}
export function registerRuntime(editor: GoTipeEditor, manager: AiManager): AiRuntime {
  const review = new AiReview(editor);
  const runtime: AiRuntime = { manager, suggestions: [], review, cleanup: [] };
  // Any edit, this replica's or another's, moves the comments with their text.
  runtime.cleanup.push(
    editor.on("update", () => {
      if (review.follow())
        editor.emit("aiReviewChange", { comments: structuredClone(review.comments) });
    }),
  );
  runtimes.set(editor, runtime);
  return runtime;
}
export function destroyRuntime(editor: GoTipeEditor): void {
  const runtime = runtimes.get(editor);
  if (!runtime) return;
  runtime.manager.destroy();
  for (const cleanup of runtime.cleanup) cleanup();
  runtimes.delete(editor);
}
export function reportAiError(editor: GoTipeEditor, error: unknown): void {
  if (editor.isDestroyed || (error instanceof Error && error.name === "AbortError")) return;
  const message = error instanceof Error ? error.message : String(error);
  editor.emit("aiStatusChange", { active: false, label: message });
  editor.reportError(new GoTipeError("EXTENSION_ERROR", message, { extension: "ai" }));
}
export function runAiTask(editor: GoTipeEditor, task: () => Promise<void>): void {
  void task().catch((error) => reportAiError(editor, error));
}
export async function collectText(source: AsyncIterable<string>): Promise<string> {
  let result = "";
  for await (const chunk of source) result += chunk;
  return result;
}
