// @vitest-environment node
import { describe, expect, it } from "vitest";
import { GoTipeError } from "../src/error";
import { FullPreset } from "../src/presets";
import type { Step } from "../src/types/state";
import { ENGINES, block, createOn, doc, paragraph } from "./engines";

/** The error `run` throws, or `undefined` when it returns. */
function failure(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

const MISSING: Step[] = [
  { type: "deleteBlock", blockId: "gone" },
  { type: "setBlockAttrs", blockId: "gone", attrs: { textAlign: "center" } },
  { type: "setBlockType", blockId: "gone", newType: "heading", attrs: { level: 2 } },
  { type: "removeMark", blockId: "gone", from: 0, to: 1, markType: "bold" },
];

describe.each(ENGINES)("%s engine: a step for a block that does not exist (D-03)", (engine) => {
  const create = () =>
    createOn(engine, {
      extensions: FullPreset,
      content: doc(paragraph("p", "Привет 😀"), block("code", "codeBlock", "let x = 1;")),
    });

  it.each(MISSING)("rejects $type as the Rust engine does, with no undo step", async (step) => {
    const editor = await create();
    try {
      const before = editor.getJSON();
      const error = failure(() => editor.dispatch({ steps: [step] }));
      expect(error).toBeInstanceOf(GoTipeError);
      expect(error).toMatchObject({ code: "TRANSFORM_ERROR", message: "Block not found: gone" });
      expect(editor.getJSON()).toEqual(before);
      expect(editor.undo()).toBe(false);
    } finally {
      editor.destroy();
    }
  });

  it("applies no step of a transaction whose later step names a missing block", async () => {
    const editor = await create();
    try {
      const before = editor.getJSON();
      const error = failure(() =>
        editor.dispatch({
          steps: [
            { type: "insertText", blockId: "p", offset: 0, text: "Ж ", marks: [] },
            { type: "deleteBlock", blockId: "gone" },
          ],
        }),
      );
      expect(error).toMatchObject({ code: "TRANSFORM_ERROR", message: "Block not found: gone" });
      expect(editor.getJSON()).toEqual(before);
      expect(editor.undo()).toBe(false);
    } finally {
      editor.destroy();
    }
  });

  it("rejects a mark step on a block without rich text", async () => {
    const editor = await create();
    try {
      const before = editor.getJSON();
      const error = failure(() =>
        editor.dispatch({
          steps: [{ type: "removeMark", blockId: "code", from: 0, to: 3, markType: "bold" }],
        }),
      );
      expect(error).toMatchObject({
        code: "TRANSFORM_ERROR",
        message: "Invalid content type for this operation",
      });
      expect(editor.getJSON()).toEqual(before);
      expect(editor.undo()).toBe(false);
    } finally {
      editor.destroy();
    }
  });

  it("checks addMark and insertText against the schema first: VALIDATION_ERROR", async () => {
    const editor = await create();
    try {
      const before = editor.getJSON();
      const mark = { type: "bold", attrs: {} };
      for (const step of [
        { type: "addMark", blockId: "gone", from: 0, to: 1, mark },
        { type: "addMark", blockId: "code", from: 0, to: 3, mark },
        { type: "insertText", blockId: "gone", offset: 0, text: "Ж", marks: [] },
      ] as Step[])
        expect(failure(() => editor.dispatch({ steps: [step] }))).toMatchObject({
          code: "VALIDATION_ERROR",
        });
      expect(editor.getJSON()).toEqual(before);
      expect(editor.undo()).toBe(false);
    } finally {
      editor.destroy();
    }
  });

  it("deletes no text from a block without content, as the Rust engine refuses", async () => {
    const editor = await createOn(engine, {
      extensions: FullPreset,
      content: doc(paragraph("p", "Привет"), block("empty", "paragraph", null)),
    });
    try {
      const before = editor.getJSON();
      const error = failure(() =>
        editor.dispatch({ steps: [{ type: "deleteText", blockId: "empty", from: 0, to: 0 }] }),
      );
      expect(error).toMatchObject({ code: "TRANSFORM_ERROR" });
      expect(editor.getJSON()).toEqual(before);
      expect(editor.undo()).toBe(false);
    } finally {
      editor.destroy();
    }
  });
});
