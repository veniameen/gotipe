// @vitest-environment jsdom
import type { GoTipeEditor, ViewState } from "@gotipe/core";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorState } from "./use-editor-state";

function store() {
  let state = { version: 1, blocks: [], selection: {}, decorations: [] } as unknown as ViewState;
  const listeners = new Set<() => void>();
  return {
    editor: {
      getViewState: () => state,
      on: (_event: string, listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    } as unknown as GoTipeEditor,
    update(version: number) {
      state = { ...state, version };
      for (const listener of listeners) listener();
    },
    get subscriptions() {
      return listeners.size;
    },
  };
}

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("useEditorState", () => {
  it("caches object selections between notifications without a render loop", () => {
    const source = store();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let renders = 0;
    function Consumer() {
      renders++;
      const selected = useEditorState(source.editor, (state) => ({ version: state.version }));
      return <span>{selected?.version}</span>;
    }
    act(() => root.render(<Consumer />));
    expect(container.textContent).toBe("1");
    act(() => source.update(2));
    expect(container.textContent).toBe("2");
    expect(renders).toBe(2);
    expect(errors).not.toHaveBeenCalled();
  });

  it("uses equality to avoid unrelated rerenders and preserves the selected reference", () => {
    const source = store();
    let renders = 0;
    const seen: unknown[] = [];
    function Consumer() {
      renders++;
      const selected = useEditorState(
        source.editor,
        (state) => ({ count: state.blocks.length }),
        (a, b) => a.count === b.count,
      );
      seen.push(selected);
      return <span>{selected?.count}</span>;
    }
    act(() => root.render(<Consumer />));
    act(() => source.update(2));
    expect(renders).toBe(1);
    act(() => root.render(<Consumer />));
    expect(seen[1]).toBe(seen[0]);
  });

  it("recomputes when the selector changes on the same editor state", () => {
    const source = store();
    function Consumer({ factor }: { factor: number }) {
      const selected = useEditorState(source.editor, (state) => state.version * factor);
      return <span>{selected}</span>;
    }
    act(() => root.render(<Consumer factor={2} />));
    expect(container.textContent).toBe("2");
    act(() => root.render(<Consumer factor={3} />));
    expect(container.textContent).toBe("3");
  });

  it("switches subscriptions and clears the selection when the editor disappears", () => {
    const first = store();
    const second = store();
    second.update(9);
    function Consumer({ editor }: { editor: GoTipeEditor | null }) {
      const selected = useEditorState(editor, (state) => state.version);
      return <span>{selected ?? "empty"}</span>;
    }
    act(() => root.render(<Consumer editor={first.editor} />));
    expect(first.subscriptions).toBe(1);
    act(() => root.render(<Consumer editor={second.editor} />));
    expect(container.textContent).toBe("9");
    expect(first.subscriptions).toBe(0);
    expect(second.subscriptions).toBe(1);
    act(() => root.render(<Consumer editor={null} />));
    expect(container.textContent).toBe("empty");
    expect(second.subscriptions).toBe(0);
  });
});
