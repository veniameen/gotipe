import type { GoTipeEditor } from "../../types/editor";
import { defineExtension } from "../../types/extension";
import type { BlockView, Decoration } from "../../types/view";
import { editorScoped } from "../scoped";

export interface FocusOptions {
  /** Class of the block that holds the caret. Default `"has-focus"`. */
  className: string;
  /**
   * `"deepest"`: only that block (default); `"all"`: it and its ancestors; `"shallowest"`: its
   * top-level ancestor.
   */
  mode: "deepest" | "all" | "shallowest";
  /** Mark nothing while the editor surface does not have focus. Default `true`. */
  onlyWhenFocused: boolean;
}

/** The decoration layer of the focused block. */
export const FOCUS_LAYER = "focus";

/** `id` and its ancestors, outermost first. */
function pathTo(blocks: readonly BlockView[], id: string): BlockView[] | null {
  for (const block of blocks) {
    if (block.id === id) return [block];
    const inner = pathTo(block.children, id);
    if (inner) return [block, ...inner];
  }
  return null;
}

class FocusController {
  private stops: (() => void)[];
  private focused: boolean;
  private painted = "";

  constructor(
    private editor: GoTipeEditor,
    private options: FocusOptions,
  ) {
    const element = editor.element;
    this.focused = !!element && element.contains(element.ownerDocument.activeElement);
    const focus = (focused: boolean) => () => {
      this.focused = focused;
      this.paint();
    };
    this.stops = [
      editor.on("selectionChange", () => this.paint()),
      editor.on("update", () => this.paint()),
      editor.on("focus", focus(true)),
      editor.on("blur", focus(false)),
    ];
    this.paint();
  }

  private paint(): void {
    const { editor, options } = this;
    const { selection, blocks } = editor.getViewState();
    const path =
      this.focused || !options.onlyWhenFocused ? pathTo(blocks, selection.head.blockId) : null;
    const marked = !path
      ? []
      : options.mode === "all"
        ? path
        : [options.mode === "shallowest" ? path[0]! : path.at(-1)!];
    const key = marked.map((block) => block.id).join(" ");
    if (key === this.painted) return;
    this.painted = key;
    const decorations: Decoration[] = marked.map((block) => ({
      type: "node",
      key: "focus",
      blockId: block.id,
      className: options.className,
      attrs: { "data-gotipe-focus": "" },
    }));
    editor.setDecorations(FOCUS_LAYER, decorations);
  }

  destroy(): void {
    for (const stop of this.stops.splice(0)) stop();
    if (!this.editor.isDestroyed) this.editor.setDecorations(FOCUS_LAYER, []);
  }
}

const controllers = editorScoped<FocusController>();

/**
 * Marks the block that holds the caret (and optionally its ancestors) with a class and
 * `data-gotipe-focus`, in the `focus` decoration layer.
 */
export const Focus = defineExtension<FocusOptions>({
  name: "focus",
  options: { className: "has-focus", mode: "deepest", onlyWhenFocused: true },
  onCreate(editor) {
    const options = {
      className: "has-focus",
      mode: "deepest",
      onlyWhenFocused: true,
      ...this.options,
    } as FocusOptions;
    controllers.attach(editor, new FocusController(editor, options));
  },
  onDestroy(editor) {
    controllers.detach(editor);
  },
});
