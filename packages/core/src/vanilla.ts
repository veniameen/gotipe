import type { GoTipeEditor } from "./editor";
import type { ViewState } from "./types/view";

export function createBubbleMenu(
  editor: GoTipeEditor,
  options: {
    element: HTMLElement;
    shouldShow?: (props: { editor: GoTipeEditor; state: ViewState }) => boolean;
    offset?: { x: number; y: number };
  },
): { destroy: () => void } {
  const { element, shouldShow, offset } = options;
  element.style.position = "fixed";
  element.style.zIndex = "var(--gt-z-bubble, 40)";
  element.style.display = "none";

  const unsub = editor.on("selectionChange", () => {
    const state = editor.getViewState();
    const show = shouldShow
      ? shouldShow({ editor, state })
      : state.selection.type === "text" &&
        state.selection.anchor.blockId === state.selection.head.blockId &&
        state.selection.anchor.offset !== state.selection.head.offset;

    if (show) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        element.style.display = "";
        element.style.top = `${rect.top - (element.offsetHeight ?? 0) - 8 + (offset?.y ?? 0)}px`;
        element.style.left = `${rect.left + rect.width / 2 - (element.offsetWidth ?? 0) / 2 + (offset?.x ?? 0)}px`;
      }
    } else {
      element.style.display = "none";
    }
  });

  return {
    destroy() {
      unsub();
      element.style.display = "none";
    },
  };
}

export function createFloatingMenu(
  editor: GoTipeEditor,
  options: {
    element: HTMLElement;
    shouldShow?: (props: { editor: GoTipeEditor; state: ViewState }) => boolean;
  },
): { destroy: () => void } {
  const { element, shouldShow } = options;
  element.style.position = "fixed";
  element.style.zIndex = "var(--gt-z-floating, 30)";
  element.style.display = "none";

  const unsub = editor.on("selectionChange", () => {
    const state = editor.getViewState();
    const currentBlock = state.blocks.find((b) => b.id === state.selection.anchor.blockId);

    const isEmpty =
      currentBlock &&
      currentBlock.type === "paragraph" &&
      (currentBlock.content === null ||
        (Array.isArray(currentBlock.content) && currentBlock.content.length === 0) ||
        (Array.isArray(currentBlock.content) && currentBlock.content.every((s) => s.text === "")));

    const show = shouldShow ? shouldShow({ editor, state }) : !!isEmpty;

    if (show) {
      const blockEl = document.querySelector(`[data-block-id="${state.selection.anchor.blockId}"]`);
      if (blockEl) {
        const rect = blockEl.getBoundingClientRect();
        element.style.display = "";
        element.style.top = `${rect.top}px`;
        element.style.left = `${rect.left - element.offsetWidth - 8}px`;
      }
    } else {
      element.style.display = "none";
    }
  });

  return {
    destroy() {
      unsub();
      element.style.display = "none";
    },
  };
}
