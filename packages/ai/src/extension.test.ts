// @vitest-environment node
import { type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { FullPreset } from "@gotipe/core/presets";
import { afterEach, describe, expect, it } from "vitest";
import { defineAiAgent } from "./agent";
import { defineAiContext } from "./context";
import { defineAi, getAiManager } from "./extension";
import { AiManager } from "./manager";
import type { AiProvider } from "./types";

const editors: GoTipeEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) if (!editor.isDestroyed) editor.destroy();
});
const provider = (executeCommand: AiProvider["executeCommand"]): AiProvider => ({
  name: "test",
  async *generateCompletion() {
    yield "completion";
  },
  async generateSuggestions() {
    return [];
  },
  executeCommand,
});
async function create(extensions: unknown[]) {
  const editor = await createEditor({
    engine: "js",
    extensions: [FullPreset, ...(extensions as never[])],
    content: {
      version: 1,
      blocks: [
        {
          id: "a",
          type: "paragraph",
          attrs: {},
          content: [{ text: "text", marks: [] }],
          children: [],
        },
      ],
    },
  });
  editors.push(editor);
  return editor;
}

describe("getAiManager", () => {
  it("returns the manager of defineAi with its provider", async () => {
    const ai = provider(async (command) => `done: ${command}`);
    const editor = await create([defineAi.configure({ provider: ai })]);
    const manager = getAiManager(editor);
    expect(manager).toBeInstanceOf(AiManager);
    expect(manager?.getProvider()).toBe(ai);
    await expect(manager?.executeCommand("summarize")).resolves.toBe("done: summarize");
  });
  it("shares the provider and the running request with the AI commands", async () => {
    let signal: AbortSignal | undefined;
    const replaced = provider((_command, context) => {
      signal = context.signal;
      return new Promise<string>((_resolve, reject) =>
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))),
      );
    });
    const editor = await create([
      defineAi.configure({ provider: provider(async () => "first") }),
      defineAiContext,
      defineAiAgent.configure({ provider: replaced }),
    ]);
    const manager = getAiManager(editor);
    expect(manager?.getProvider()).toBe(replaced);
    const pending = manager?.executeCommand("summarize");
    expect(manager?.processing).toBe(true);
    // Closing the command bar emits cancelAi, which cancels the host's request as well.
    editor.emit("executeAiCommand", { commandId: "cancelAi" });
    expect(signal?.aborted).toBe(true);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(manager?.processing).toBe(false);
  });
  it("is undefined without defineAi and once the editor is destroyed", async () => {
    expect(getAiManager(await create([]))).toBeUndefined();
    const editor = await create([defineAi]);
    const manager = getAiManager(editor);
    const other = getAiManager(await create([defineAi]));
    expect(manager).toBeDefined();
    expect(other).not.toBe(manager);
    editor.destroy();
    expect(getAiManager(editor)).toBeUndefined();
    expect(() => manager?.setProvider(provider(async () => ""))).toThrow(
      "AI manager has been destroyed",
    );
  });
});
