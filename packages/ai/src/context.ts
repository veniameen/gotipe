import { type GoTipeEditor, defineExtension } from "@gotipe/core";
import { collectText, getRuntime, runAiTask } from "./runtime";
import type { AiContextOptions } from "./types";

/** Context commands capture their insertion/selection before requesting any provider work. */
export const defineAiContext = defineExtension<AiContextOptions>({
  name: "ai-context",
  dependencies: ["ai"],
  slashCommands: [
    {
      name: "Continue Writing",
      aliases: ["continue", "write", "generate"],
      description: "AI generates the next paragraph",
      icon: "✨",
      group: "ai",
      execute(editor: GoTipeEditor) {
        editor.emit("executeAiCommand", { commandId: "continueWriting" });
      },
    },
    {
      name: "Ask AI",
      aliases: ["ai", "ask", "prompt"],
      description: "Free prompt — AI generates content",
      icon: "💬",
      group: "ai",
      execute(editor: GoTipeEditor) {
        editor.emit("executeAiCommand", { commandId: "askAi" });
      },
    },
  ],
  onCreate(editor) {
    const runtime = getRuntime(editor);
    if (!runtime) return;
    const manager = runtime.manager;
    if (this.options?.provider) manager.setProvider(this.options?.provider);
    runtime.cleanup.push(
      editor.on("executeAiCommand", (payload) => {
        if (!["rewrite", "continueWriting", "askAi"].includes(payload.commandId)) return;
        if (payload.commandId === "askAi" && !payload.prompt?.trim()) return;
        runAiTask(editor, async () => {
          const target = manager.captureTarget();
          if (payload.commandId === "rewrite") {
            const selected = manager.buildContext().selectedText;
            if (!selected) throw new Error("Select text to improve");
            const result = await collectText(manager.streamRewrite(selected));
            if (result)
              manager.applySuggestion(
                { id: crypto.randomUUID(), type: "rewrite", content: result, confidence: 1 },
                target,
              );
          } else {
            const stream =
              payload.commandId === "continueWriting"
                ? manager.streamContinueWriting()
                : manager.streamGenerateParagraph(payload.prompt!);
            manager.insertParagraph(await collectText(stream), target);
          }
        });
      }),
    );
  },
});
