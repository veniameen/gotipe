// @vitest-environment node
import { type Block, type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { FullPreset } from "@gotipe/core/presets";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acceptAllProofreadSuggestions,
  acceptProofreadSuggestion,
  defineAiAgent,
  getProofreadSuggestions,
} from "./agent";
import { defineAiContext } from "./context";
import { defineAi } from "./extension";
import { AiManager } from "./manager";
import type { AiProofreadSuggestion, AiProvider } from "./types";

/** The platform crypto, kept before a test stubs the global. */
const platform = globalThis.crypto;

const paragraph = (id: string, text: string, children: Block[] = []): Block => ({
  id,
  type: "paragraph",
  attrs: {},
  content: [{ text, marks: [] }],
  children,
});
const editors: GoTipeEditor[] = [];
const managers: AiManager[] = [];
afterEach(() => {
  for (const manager of managers.splice(0)) manager.destroy();
  for (const editor of editors.splice(0)) editor.destroy();
  vi.unstubAllGlobals();
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
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
async function create(blocks = [paragraph("a", "first"), paragraph("b", "last")], ai?: AiProvider) {
  const editor = await createEditor({
    engine: "js",
    extensions: [
      FullPreset,
      ...(ai ? [defineAi.configure({ provider: ai }), defineAiContext, defineAiAgent] : []),
    ],
    content: { blocks, version: 1 },
  });
  editors.push(editor);
  editor.setSelection({
    anchor: { blockId: blocks[0]!.id, offset: 0 },
    head: { blockId: blocks[0]!.id, offset: 0 },
  });
  return editor;
}
function manager(editor: GoTipeEditor, ai: AiProvider, privacy = false) {
  const value = new AiManager(editor, { provider: ai, enablePiiDetection: privacy });
  managers.push(value);
  return value;
}
const flush = async () => {
  for (let index = 0; index < 10; index++) await Promise.resolve();
};

describe("AI request ownership", () => {
  it("provides backward nested and raw selections without unsafe view casts", async () => {
    const child = paragraph("child", "Ж😀 nested");
    const editor = await create([
      {
        id: "list",
        type: "bulletList",
        attrs: {},
        content: null,
        children: [{ ...child, type: "listItem" }],
      },
      { ...paragraph("code", "raw text"), type: "codeBlock", content: "raw text" },
    ]);
    editor.setSelection({
      anchor: { blockId: "code", offset: 3 },
      head: { blockId: "child", offset: 1 },
    });
    const ai = manager(editor, provider());
    expect(ai.buildContext().selectedText).toBe("😀 nested\nraw");
    expect(ai.buildFullContext().fullText).toContain("Ж😀 nested\nraw text");
    expect(ai.buildContext().currentBlock?.id).toBe("code");
  });
  it("drops superseded requests without clearing the new status", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const execute = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const editor = await create();
    const ai = manager(editor, provider({ executeCommand: execute }));
    const older = ai.executeCommand("first");
    const rejected = expect(older).rejects.toMatchObject({ name: "AbortError" });
    const newer = ai.executeCommand("second");
    expect(execute.mock.calls[0]![1].signal.aborted).toBe(true);
    first.resolve("old");
    await rejected;
    expect(ai.processing).toBe(true);
    second.resolve("new");
    await expect(newer).resolves.toBe("new");
    expect(ai.processing).toBe(false);
  });
  it.each(["edit", "read-only", "destroy"])("rejects late responses after %s", async (action) => {
    const result = deferred<string>();
    const editor = await create();
    const ai = manager(editor, provider({ executeCommand: () => result.promise }));
    const pending = ai.executeCommand("rewrite");
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    if (action === "edit") editor.chain().insertText("new ").run();
    if (action === "read-only") editor.setEditable(false);
    if (action === "destroy") editor.destroy();
    result.resolve("late");
    await rejected;
    expect(ai.processing).toBe(false);
  });
  it("applies cross-block rewrite at the captured range after caret movement in one undo", async () => {
    const editor = await create([paragraph("a", "Ж😀 one"), paragraph("b", "two end")]);
    editor.setSelection({ anchor: { blockId: "b", offset: 3 }, head: { blockId: "a", offset: 1 } });
    const ai = manager(editor, provider());
    const target = ai.captureTarget();
    editor.setSelection({ anchor: { blockId: "b", offset: 7 }, head: { blockId: "b", offset: 7 } });
    ai.applySuggestion({ id: "rewrite", type: "rewrite", content: "fixed", confidence: 1 }, target);
    expect(editor.getText()).toBe("Жfixed end");
    expect(editor.undo()).toBe(true);
    expect(editor.getText()).toBe("Ж😀 one\ntwo end");
  });
  it("inserts generated content beside its source and does not partially write failed streams", async () => {
    const editor = await create(
      undefined,
      provider({
        async *generateParagraph() {
          yield "hello ";
          yield "world";
        },
      }),
    );
    editor.emit("executeAiCommand", { commandId: "addParagraph", prompt: "topic" });
    await vi.waitFor(() => expect(editor.getJSON().blocks).toHaveLength(3));
    expect(editor.getJSON().blocks.map((block) => block.content)).toEqual([
      [{ text: "first", marks: [] }],
      [{ text: "hello world", marks: [] }],
      [{ text: "last", marks: [] }],
    ]);
    editor.undo();
    expect(editor.getText()).toBe("first\nlast");
    const errors: string[] = [];
    const failed = await create(
      undefined,
      provider({
        async *generateParagraph() {
          yield "partial";
          throw new Error("provider unavailable");
        },
      }),
    );
    failed.on("error", (error) => errors.push(error.message));
    failed.emit("executeAiCommand", { commandId: "addParagraph", prompt: "topic" });
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(failed.getText()).toBe("first\nlast");
    expect(failed.getViewState().toolbar.canUndo).toBe(false);
    expect(errors).toEqual(["provider unavailable"]);
  });
  it("blocks enabled PII detection before transmitting context or prompt", async () => {
    const execute = vi.fn(async () => "ok");
    const editor = await create([paragraph("a", "Ж😀 a@example.com")]);
    const ai = manager(editor, provider({ executeCommand: execute }), true);
    await expect(ai.executeCommand("rewrite")).rejects.toThrow("detected email");
    expect(execute).not.toHaveBeenCalled();
    editor.setContent({ blocks: [paragraph("a", "clean")], version: 1 });
    expect(() => ai.streamGenerateParagraph("Call +1 (555) 123-4567")).toThrow("detected email");
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("AI proofreading integrity", () => {
  const suggestion = (
    id: string,
    from: number,
    to: number,
    originalText: string,
    suggestedText: string,
  ): AiProofreadSuggestion => ({
    id,
    blockId: "a",
    from,
    to,
    originalText,
    suggestedText,
    type: "replace",
  });
  const corrections = [
    suggestion("one", 0, 3, "bad", "better"),
    suggestion("two", 4, 7, "bad", "good"),
  ];
  it("accepts a batch atomically with one undo and rejects all when any anchor is stale", async () => {
    const editor = await create([paragraph("a", "bad bad")]);
    const ai = manager(editor, provider({ proofread: async () => corrections }));
    const pending = await ai.proofread();
    ai.applyProofreadSuggestions(pending);
    expect(editor.getText()).toBe("better good");
    editor.undo();
    expect(editor.getText()).toBe("bad bad");
    const stale = await ai.proofread();
    editor.chain().insertText("x").run();
    const before = editor.getText();
    expect(() => ai.applyProofreadSuggestions(stale)).toThrow("stale");
    expect(editor.getText()).toBe(before);
    expect(() =>
      ai.applyProofreadSuggestions([corrections[0]!, { ...corrections[1]!, blockId: "missing" }]),
    ).toThrow();
    expect(editor.getText()).toBe(before);
  });
  it("rebases remaining review offsets after accepting an earlier correction", async () => {
    const editor = await create(
      [paragraph("a", "bad bad")],
      provider({ proofread: async () => structuredClone(corrections) }),
    );
    editor.emit("executeAiCommand", { commandId: "proofread" });
    await flush();
    acceptProofreadSuggestion(editor, "one");
    expect(getProofreadSuggestions(editor)[0]?.from).toBe(7);
    acceptAllProofreadSuggestions(editor);
    expect(editor.getText()).toBe("better good");
    expect(getProofreadSuggestions(editor)).toEqual([]);
  });
  it("rejects overlapping provider edits and invalid emoji boundaries before exposing them", async () => {
    const editor = await create([paragraph("a", "Ж😀 text")]);
    const ai = manager(
      editor,
      provider({ proofread: async () => [suggestion("invalid", 2, 3, "\ude00", "x")] }),
    );
    await expect(ai.proofread()).rejects.toThrow("original text");
    expect(editor.getText()).toBe("Ж😀 text");
  });
});

describe("a page served over plain HTTP (D-85)", () => {
  it("inserts generated paragraphs without crypto.randomUUID", async () => {
    const editor = await create(
      undefined,
      provider({
        async *generateParagraph() {
          yield "hello";
        },
      }),
    );
    vi.stubGlobal("crypto", {
      getRandomValues: (array: Uint8Array) => platform.getRandomValues(array),
    });
    const errors: unknown[] = [];
    editor.on("error", (error) => errors.push(error));
    editor.emit("executeAiCommand", { commandId: "addParagraph", prompt: "topic" });
    await vi.waitFor(() => expect(editor.getJSON().blocks).toHaveLength(3));
    expect(errors).toEqual([]);
    expect(editor.getJSON().blocks[1]!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
