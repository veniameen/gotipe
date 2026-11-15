// @vitest-environment jsdom
import type { GoTipeEditor } from "@gotipe/core";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageEditor } from "./page-editor";

let container: HTMLDivElement;
let root: Root;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const rect = { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  Range.prototype.getBoundingClientRect = () => ({ ...rect, toJSON() {} }) as DOMRect;
  Range.prototype.getClientRects = () => [rect] as unknown as DOMRectList;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("PageEditor's onReady (D-27)", () => {
  it("runs onReady and autoFocus once per editor: a new callback keeps the draft and the caret", async () => {
    const editors: GoTipeEditor[] = [];
    const focus = vi.fn();
    const drafts: string[] = [];
    // a host that passes a new function on every render
    const draw = () =>
      root.render(
        <PageEditor
          markdown={"# Notes\n\nBody text.\n"}
          locale="en"
          autoFocus
          onChange={(markdown) => drafts.push(markdown)}
          onReady={(editor) => {
            editors.push(editor);
            // autoFocus comes right after onReady
            vi.spyOn(editor, "focus").mockImplementation(focus);
          }}
        />,
      );
    await act(async () => {
      draw();
      await wait(60);
    });
    expect(editors).toHaveLength(1);
    expect(focus.mock.calls).toEqual([["end"]]);
    const editor = editors[0]!;
    const body = editor.getViewState().blocks[1]!.id;

    act(() => {
      editor.setSelection({
        anchor: { blockId: body, offset: 0 },
        head: { blockId: body, offset: 0 },
      });
      editor.chain().insertText("New ").run();
    });
    // the host renders again before the draft's frame
    act(() => draw());
    expect(editors).toHaveLength(1);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(editor.getViewState().selection.head).toEqual({ blockId: body, offset: 4 });
    await act(() => wait(60));
    expect(drafts).toEqual(["# Notes\n\nNew Body text.\n"]);
  });
});
