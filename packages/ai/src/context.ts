import { defineExtension, type GoTipeEditor } from "@gotipe/core";
import type { AiManager } from "./manager";
import type { AiContextOptions } from "./types";

function getManager(editor: GoTipeEditor): AiManager | null {
  return ((editor as unknown as Record<string, unknown>).__aiManager as AiManager) ?? null;
}

/**
 * Level 2 — AIContext extension.
 *
 * Adds:
 * - "Improve" action in Bubble Menu (rewrites selected text as streaming suggestion)
 * - "Continue Writing" in Slash Menu (AI generates next paragraph via streaming)
 * - "Ask AI" in Slash Menu (free prompt → AI content)
 *
 * Requires the base `defineAi` extension to be loaded first (provides AiManager).
 * The bubble menu's "Improve" button is handled by listening to the `executeAiCommand`
 * event with `commandId: "rewrite"`.
 */
export const defineAiContext = defineExtension<AiContextOptions>({
  name: "ai-context",
  dependencies: ["ai"],

  slashCommands: [
    {
      name: "Continue Writing",
      aliases: ["continue", "write", "generate"],
      description: "AI generates the next paragraph",
      icon: "\u2728",
      group: "ai" as const,
      execute(editor: GoTipeEditor) {
        const manager = getManager(editor);
        if (!manager) return;

        (async () => {
          // Insert a new paragraph block after the current one
          editor.chain().insertBlockAfter("paragraph").run();

          // Stream content into the new block token by token
          let accumulated = "";
          for await (const chunk of manager.streamContinueWriting()) {
            accumulated += chunk;
            // Get the new block (last in the list after insert)
            const state = editor.getViewState();
            const lastBlock = state.blocks[state.blocks.length - 1];
            if (lastBlock) {
              editor.dispatch({
                steps: [
                  {
                    type: "insertText",
                    blockId: lastBlock.id,
                    offset: accumulated.length - chunk.length,
                    text: chunk,
                    marks: [],
                  },
                ],
              });
            }
          }
        })();
      },
    },
    {
      name: "Ask AI",
      aliases: ["ai", "ask", "prompt"],
      description: "Free prompt — AI generates content",
      icon: "\uD83D\uDCAC",
      group: "ai" as const,
      execute(editor: GoTipeEditor) {
        // Open the AI Command Bar for free-text input
        editor.emit("executeAiCommand", { commandId: "askAi" });
      },
    },
  ],

  onCreate(editor: GoTipeEditor) {
    const opts = this.options as AiContextOptions;
    const manager = getManager(editor);

    // If context extension provides its own provider, set it on the manager
    if (opts?.provider && manager) {
      manager.setProvider(opts.provider);
    }

    // Listen for AI commands from UI components
    editor.on("executeAiCommand", (payload) => {
      if (!manager) return;

      if (payload.commandId === "rewrite") {
        handleRewrite(editor, manager);
      } else if (payload.commandId === "continueWriting") {
        handleContinueWriting(editor, manager);
      } else if (payload.commandId === "askAi") {
        // Open AI Command Bar — handled by UI layer (Mod-k)
        // If prompt is provided, generate content directly
        if (payload.prompt) {
          handleAskAi(editor, manager, payload.prompt);
        }
      }
    });
  },
});

/**
 * Handles "Improve" / rewrite: streams a rewritten version of selected text
 * and replaces the selection with the result.
 */
async function handleRewrite(editor: GoTipeEditor, manager: AiManager): Promise<void> {
  const context = manager.buildContext();
  if (!context.selectedText) return;

  let result = "";
  for await (const chunk of manager.streamRewrite(context.selectedText)) {
    result += chunk;
  }

  if (!result) return;

  // Apply the rewrite as a suggestion
  manager.applySuggestion({
    id: crypto.randomUUID(),
    type: "rewrite",
    content: result,
    confidence: 1,
  });
}

/**
 * Handles "Continue Writing": streams AI completion into a new paragraph.
 */
async function handleContinueWriting(editor: GoTipeEditor, manager: AiManager): Promise<void> {
  editor.chain().insertBlockAfter("paragraph").run();

  const state = editor.getViewState();
  const newBlock = state.blocks[state.blocks.length - 1];
  if (!newBlock) return;

  let offset = 0;
  for await (const chunk of manager.streamContinueWriting()) {
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
}

/**
 * Handles "Ask AI": generates content from a free-text prompt and inserts it.
 */
async function handleAskAi(
  editor: GoTipeEditor,
  manager: AiManager,
  prompt: string,
): Promise<void> {
  editor.chain().insertBlockAfter("paragraph").run();

  const state = editor.getViewState();
  const newBlock = state.blocks[state.blocks.length - 1];
  if (!newBlock) return;

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
}
