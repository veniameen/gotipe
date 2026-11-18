import type { GoTipeEditor } from "@gotipe/core";
import type React from "react";
import { useLayoutEffect } from "react";
import {
  getBlockElById,
  getBlockFirstLineMetrics,
  getToolbarRailLeft,
} from "../components/block-interaction";
import { handleRail } from "../text/direction";
import type { ToolbarPosition, ToolbarTarget } from "./use-toolbar-hover";

/**
 * Keeps the floating block toolbar beside its block's first line while the document, the
 * container or the page moves; hides it when the block or the room beside it is gone.
 */
export function useToolbarFollow(
  editor: GoTipeEditor | null,
  container: React.RefObject<HTMLDivElement | null>,
  target: ToolbarTarget | null,
  hideNow: () => void,
  setPosition: React.Dispatch<React.SetStateAction<ToolbarPosition | null>>,
) {
  useLayoutEffect(() => {
    const root = container.current;
    if (!root || !target || !editor) return;
    const update = () => {
      const block = getBlockElById(root, target.anchorBlockId);
      const rail = block && handleRail(root, block, getToolbarRailLeft);
      if (!block || !rail) return hideNow();
      const box = root.getBoundingClientRect();
      const line = getBlockFirstLineMetrics(block);
      const next = { top: line.top - box.top + line.height / 2, ...rail };
      setPosition((previous) =>
        previous?.top === next.top && previous.left === next.left && previous.right === next.right
          ? previous
          : next,
      );
    };
    const observer = new ResizeObserver(update);
    observer.observe(root);
    const unsubscribe = editor.on("viewStateChange", update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    update();
    return () => {
      observer.disconnect();
      unsubscribe();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [editor, container, target, hideNow, setPosition]);
}
