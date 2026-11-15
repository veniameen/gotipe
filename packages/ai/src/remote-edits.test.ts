// @vitest-environment node
import { type Block, type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { FullPreset } from "@gotipe/core/presets";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineAiAgent } from "./agent";
import { defineAiContext } from "./context";
import { defineAi } from "./extension";
import { AiManager } from "./manager";
import type { AiComment, AiProofreadSuggestion, AiProvider } from "./types";

const paragraph = (id: string, text: string): Block => ({
  id,
  type: "paragraph",
  attrs: {},
  content: [{ text, marks: [] }],
  children: [],
});
const editors: GoTipeEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
const provider = (extra: Partial<AiProvider> = {}): AiProvider => ({
  name: "test",
  async *generateCompletion() {
    yield "completion";
  },
  async generateSuggestions() {
    return [];
  },
  async executeCommand() {
    return "result";
  },
  ...extra,
});
async function create(ai: AiProvider, agent = false) {
  const editor = await createEditor({
    engine: "js",
    extensions: [
      FullPreset,
      ...(agent ? [defineAi.configure({ provider: ai }), defineAiContext, defineAiAgent] : []),
    ],
    content: { blocks: [paragraph("a", "bad one"), paragraph("b", "bad two")], version: 1 },
  });
  editors.push(editor);
  editor.setSelection({ anchor: { blockId: "a", offset: 7 }, head: { blockId: "a", offset: 7 } });
  const manager = new AiManager(editor, { provider: ai });
  editors.push({ destroy: () => manager.destroy() } as GoTipeEditor);
  return { editor, ai: manager };
}
/** What the editor does with another replica's edit: a repair is that edit's (`origin: "remote"`). */
const remoteEdit = (editor: GoTipeEditor, blockId: string) =>
  editor.dispatch({
    steps: [{ type: "insertText", blockId, offset: 0, text: "peer ", marks: [] }],
    metadata: { origin: "repair", addToHistory: false },
  });
const flush = async () => {
  for (let index = 0; index < 10; index++) await Promise.resolve();
};

describe("AI and another replica's edits (D-46)", () => {
  it("another replica's edit leaves the request running; a local one cancels it", async () => {
    const result = deferred<string>();
    const { editor, ai } = await create(provider({ executeCommand: () => result.promise }));
    const pending = ai.executeCommand("rewrite");
    remoteEdit(editor, "b");
    expect(ai.processing).toBe(true);
    result.resolve("done");
    await expect(pending).resolves.toBe("done");
    const next = ai.executeCommand("rewrite");
    const rejected = expect(next).rejects.toMatchObject({ name: "AbortError" });
    editor.chain().insertText("!").run();
    await rejected;
  });

  it("a result applies while only other blocks changed, not when its own block did", async () => {
    const { editor, ai } = await create(provider());
    const target = ai.captureTarget();
    remoteEdit(editor, "b");
    ai.insertParagraph("AI text", target);
    expect(editor.getJSON().blocks.map((block) => block.id)).toHaveLength(3);
    expect(editor.getText()).toContain("AI text");
    editor.setSelection({ anchor: { blockId: "a", offset: 7 }, head: { blockId: "a", offset: 7 } });
    const own = ai.captureTarget();
    remoteEdit(editor, "a");
    expect(() => ai.insertParagraph("again", own)).toThrow("The document changed");
  });

  it("proofread drops corrections in blocks another replica changed, keeps the rest", async () => {
    const result = deferred<AiProofreadSuggestion[]>();
    const { editor, ai } = await create(provider({ proofread: () => result.promise }));
    const pending = ai.proofread();
    remoteEdit(editor, "b");
    const fix = (id: string, blockId: string): AiProofreadSuggestion => ({
      id,
      blockId,
      from: 0,
      to: 3,
      type: "replace",
      originalText: "bad",
      suggestedText: "good",
    });
    result.resolve([fix("one", "a"), fix("two", "b")]);
    expect((await pending).map((item) => item.id)).toEqual(["one"]);
    ai.applyProofreadSuggestions([fix("one", "a")]);
    expect(editor.getText()).toBe("good one\npeer bad two");
  });

  it("AI review comments have their own event, not the comment store's", async () => {
    const comment: AiComment = {
      id: "c1",
      blockId: "a",
      from: 0,
      to: 3,
      quotedText: "bad",
      body: "Say it better",
    };
    const { editor } = await create(provider({ reviewComments: async () => [comment] }), true);
    const events: string[] = [];
    const reviews: unknown[][] = [];
    editor.on("commentAdded", () => events.push("commentAdded"));
    editor.on("commentDeleted", () => events.push("commentDeleted"));
    editor.on("aiReviewChange", ({ comments }) => reviews.push(comments));
    editor.emit("executeAiCommand", { commandId: "review" });
    await vi.waitFor(() => expect(reviews).toEqual([[comment]]));
    editor.chain().insertText("!").run();
    await flush();
    expect(reviews).toEqual([[comment], []]);
    expect(events).toEqual([]);
  });
});
