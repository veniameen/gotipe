import { describe, expect, it } from "vitest";
import { createCollaboration } from "../src/editor/collaboration";
import { createEditor } from "../src/js";
import type { SelectionView } from "../src/types/view";

const document = (id: string, text: string, attrs = {}) =>
  JSON.stringify({
    version: 1,
    blocks: [
      {
        id,
        block_type: "paragraph",
        attrs,
        content: { type: "RichText", value: [{ text, marks: [] }] },
        children: [],
      },
    ],
  });

describe("public collaboration boundary", () => {
  it("reports unsupported JS collaboration explicitly without changing content", async () => {
    const editor = await createEditor({ extensions: [], content: "before" });
    expect(() => editor.enableCollaboration("peer-a")).toThrow("requires the WASM engine");
    expect(() => editor.getCollaborationUpdate()).toThrow("requires the WASM engine");
    expect(() => editor.receiveCollaborationUpdate(new Uint8Array())).toThrow(
      "requires the WASM engine",
    );
    expect(editor.getText()).toBe("before");
    editor.destroy();
    expect(() => editor.enableCollaboration("peer-a")).toThrow("destroyed");
  });

  it("keeps duplicate updates out of events/history and safely maps a removed caret block", () => {
    let current = document("old", "before", { a: 1, b: 2 });
    let incoming = document("old", "before", { b: 2, a: 1 });
    let selection: SelectionView = {
      type: "text",
      anchor: { blockId: "old", offset: 6 },
      head: { blockId: "old", offset: 6 },
    };
    let histories = 0;
    const notifications: SelectionView[] = [];
    const update = new Uint8Array([1, 2, 3]);
    const collaboration = createCollaboration(
      {
        engine: "wasm",
        enableCollaboration: () => {},
        getState: () => current,
        getUpdate: () => update,
        setSelection: () => {},
        getSelection: () =>
          JSON.stringify({ Cursor: { block_id: JSON.parse(current).blocks[0].id, offset: 1 } }),
        receiveUpdate: () => {
          current = incoming;
          return incoming;
        },
      },
      {
        destroyed: false,
        beforeMutation: () => {},
        get selection() {
          return selection;
        },
        set selection(value) {
          selection = value;
        },
        resetHistory: () => {
          histories++;
        },
        changed: () => notifications.push(selection),
        isAtomic: null,
        repair: () => {
          throw new Error("A schema without atomic marks never repairs");
        },
      },
    );
    expect(() => collaboration.getUpdate()).toThrow("Enable collaboration");
    collaboration.enable("peer-a");
    expect(histories).toBe(1);
    collaboration.enable("peer-a");
    expect(histories).toBe(1);
    expect(() => collaboration.enable("peer-b")).toThrow("cannot change");
    collaboration.receiveUpdate(new Uint8Array());
    expect(histories).toBe(1);
    expect(notifications).toEqual([]);
    incoming = document("new", "X");
    collaboration.receiveUpdate(new Uint8Array());
    expect(histories).toBe(1);
    expect(notifications[0]!.anchor).toEqual({ blockId: "new", offset: 1 });
    const copy = collaboration.getUpdate();
    copy[0] = 9;
    expect(update[0]).toBe(1);
  });

  it("retains exact multi-block IDs through transaction and undo/redo", async () => {
    const editor = await createEditor({
      extensions: [],
      content: {
        version: 1,
        blocks: ["a", "b", "c"].map((id) => ({
          id,
          type: "paragraph",
          attrs: {},
          content: [{ text: id, marks: [] }],
          children: [],
        })),
      },
    });
    editor.dispatch({ steps: [], selection: { type: "multi", blockIds: ["a", "c"] } });
    expect(editor.getViewState().selection.blockIds).toEqual(["a", "c"]);
    editor.dispatch({
      steps: [{ type: "insertText", blockId: "b", offset: 1, text: "!", marks: [] }],
    });
    editor.undo();
    expect(editor.getViewState().selection).toMatchObject({ type: "multi", blockIds: ["a", "c"] });
    editor.redo();
    expect(editor.getViewState().selection.blockIds).toEqual(["a", "c"]);
    editor.destroy();
  });
});
