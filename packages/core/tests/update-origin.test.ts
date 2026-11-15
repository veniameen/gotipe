import { afterEach, describe, expect, it } from "vitest";
import { Bold, Paragraph } from "../src/extensions";
import type { GoTipeEditor } from "../src/types/editor";
import { ENGINES, createOn, doc, paragraph } from "./engines";

const editors: GoTipeEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe.each(ENGINES)("%s update origin (D-46)", (engine) => {
  async function open(text = "ab") {
    const editor = await createOn(engine, {
      extensions: [Paragraph, Bold],
      content: doc(paragraph("p", text)),
    });
    editors.push(editor);
    const origins: string[] = [];
    editor.on("update", ({ origin }) => origins.push(origin));
    return { editor, origins };
  }

  it("is local for dispatch, commands, Undo, Redo and setContent", async () => {
    const { editor, origins } = await open();
    editor.dispatch({
      steps: [{ type: "insertText", blockId: "p", offset: 2, text: "c", marks: [] }],
    });
    editor.chain().setSelection({ type: "cursor", blockId: "p", offset: 0 }).insertText("Ж").run();
    editor.undo();
    editor.redo();
    editor.setContent(doc(paragraph("p", "new")));
    expect(origins).toEqual(["local", "local", "local", "local", "local"]);
  });

  it("is remote for the repair after another replica's edit", async () => {
    const { editor, origins } = await open();
    editor.dispatch({
      steps: [{ type: "insertText", blockId: "p", offset: 0, text: "x", marks: [] }],
      metadata: { origin: "repair", addToHistory: false },
    });
    expect(origins).toEqual(["remote"]);
  });

  it.runIf(engine === "wasm")("is remote for another replica's update", async () => {
    const { editor: peer } = await open();
    const { editor, origins } = await open();
    peer.enableCollaboration("peer-a");
    editor.enableCollaboration("peer-b");
    editor.receiveCollaborationUpdate(peer.getCollaborationUpdate());
    origins.length = 0;
    peer.dispatch({
      steps: [{ type: "insertText", blockId: "p", offset: 2, text: "!", marks: [] }],
    });
    editor.receiveCollaborationUpdate(peer.getCollaborationUpdate());
    expect(editor.getText()).toBe("ab!");
    expect(origins).toEqual(["remote"]);
    editor.dispatch({
      steps: [{ type: "insertText", blockId: "p", offset: 0, text: "?", marks: [] }],
    });
    expect(origins).toEqual(["remote", "local"]);
  });
});
